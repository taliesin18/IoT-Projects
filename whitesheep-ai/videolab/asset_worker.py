"""Offline worker for fixed Blender presets. Never executes project-supplied code."""
import json
import os
import subprocess
import time
from pathlib import Path
from uuid import UUID

ROOT = Path('/videos/library')
ROOT.mkdir(parents=True, exist_ok=True)


def status(path, state, message):
    target = path / 'status.json'
    tmp = path / 'status.tmp'
    tmp.write_text(json.dumps({'state': state, 'message': message}), encoding='utf-8')
    os.replace(tmp, target)


def process(path):
    target = path / 'status.json'
    if target.exists():
        if json.loads(target.read_text(encoding='utf-8')).get('state') == 'running':
            status(path, 'failed', 'Asset rendering was interrupted. Create a new asset to retry.')
        return
    status(path, 'running', 'Rendering the reusable Blender asset locally.')
    try:
        with (path / 'render.log').open('ab') as log:
            subprocess.run(['blender', '--background', '--factory-startup', '--threads', '4',
                            '--python-exit-code', '1', '--python', '/app/asset_scene.py', '--', path.name],
                           check=True, timeout=1200, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
        image = Path('/videos/public/library') / path.name / 'render.png'
        if not image.is_file() or image.stat().st_size < 1024 or not (path / 'object.blend').is_file():
            raise ValueError('Expected Blender outputs are missing')
        status(path, 'complete', 'Image and editable Blender scene are ready.')
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        status(path, 'failed', f'Asset rendering failed: {type(exc).__name__}. See the local render.log.')


while True:
    for path in ROOT.iterdir():
        try:
            UUID(path.name)
            if path.is_dir() and not path.is_symlink() and (path / 'queued').is_dir():
                process(path)
        except (ValueError, OSError, json.JSONDecodeError):
            continue
    time.sleep(2)
