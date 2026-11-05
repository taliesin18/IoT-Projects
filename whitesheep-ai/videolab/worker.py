"""Execute only a fixed, reviewed Remotion template in an offline container."""
import json
import math
import os
import subprocess
import time
from pathlib import Path
from uuid import UUID

ROOT = Path('/videos')


def write(path, data):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    os.replace(temp, path)


def execute(args, log):
    with log.open('ab') as output:
        subprocess.run(args, check=True, timeout=1800, stdout=output, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL)


def process(path):
    status = path / 'status.json'
    if status.exists():
        current = json.loads(status.read_text(encoding='utf-8'))
        if current.get('state') == 'running':
            write(status, {'state': 'failed', 'message': 'Render was interrupted. Create a new project to retry.'})
        return
    write(status, {'state': 'running', 'message': 'Preparing the local video.'})
    try:
        data = json.loads((path / 'project.json').read_text(encoding='utf-8'))
        title, subtitle, narration, duration = data['title'], data['subtitle'], data['narration'], data['duration']
        if not isinstance(title, str) or not 0 < len(title) <= 120 or not isinstance(subtitle, str) or len(subtitle) > 240 or not isinstance(narration, str) or len(narration) > 800 or type(duration) is not int or not 2 <= duration <= 60:
            raise ValueError('Invalid project settings')
        public = ROOT / 'public'
        audio = public / 'audio'
        audio.mkdir(parents=True, exist_ok=True)
        if public.is_symlink() or audio.is_symlink():
            raise ValueError('Linked asset directories are not allowed')
        audio_file = audio / f'{path.name}.wav'
        log = path / 'render.log'
        if narration:
            (path / 'narration.txt').write_text(narration, encoding='utf-8')
            execute(['python', '-m', 'piper', '-m', '/app/voices/en_US-lessac-medium.onnx', '-i', str(path / 'narration.txt'), '-f', str(audio_file)], log)
            probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(audio_file)], check=True, capture_output=True, text=True, timeout=30)
            duration = max(duration, math.ceil((float(probe.stdout.strip()) + .25) * 24) / 24)
            if duration > 120:
                raise ValueError('Narration exceeds two minutes; shorten it and create a new project')
        asset_id = data.get('asset_id')
        image_path = ''
        if asset_id:
            asset_id = str(UUID(asset_id))
            asset = ROOT / 'library' / asset_id
            image = public / 'library' / asset_id / 'render.png'
            if asset.is_symlink() or image.is_symlink() or not image.is_file() or json.loads((asset / 'status.json').read_text())['state'] != 'complete':
                raise ValueError('Selected asset is unavailable')
            image_path = f'library/{asset_id}/render.png'
        props = path / 'props.json'
        write(props, {'title': title, 'subtitle': subtitle, 'duration': duration, 'narration': bool(narration),
                      'audioPath': f'audio/{path.name}.wav' if narration else '', 'imagePath': image_path})
        write(status, {'state': 'running', 'message': 'Rendering a vertical video. This may take several minutes.'})
        output = path / 'final.mp4'
        execute(['npx', '--no-install', 'remotion', 'render', 'src/StudioProject.tsx', 'StudioProject', str(output), '--public-dir', str(public), '--props', str(props), '--codec', 'h264', '--crf', '20'], log)
        execute(['ffmpeg', '-v', 'error', '-xerror', '-i', str(output), '-f', 'null', '-'], log)
        write(status, {'state': 'complete', 'duration': duration, 'message': 'Rendered and decoded successfully.'})
    except (ValueError, KeyError, OSError, subprocess.SubprocessError) as error:
        write(status, {'state': 'failed', 'message': f'Render failed: {type(error).__name__}. See the local render.log for details.'})


while True:
    for project in ROOT.iterdir():
        try:
            UUID(project.name)
            if project.is_dir() and not project.is_symlink() and (project / 'queued').is_dir():
                process(project)
        except (ValueError, OSError, json.JSONDecodeError):
            continue
    time.sleep(2)
