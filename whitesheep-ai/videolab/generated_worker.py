"""Host-side launcher for reviewed jobs; never mounts the Docker socket into Blender."""
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / 'video-projects' / 'library'
PUBLIC = ROOT / 'video-projects' / 'public' / 'library'
IMAGE = 'openmontage-studio:3d-v1'
IMAGE_ID = 'sha256:349d1f7665cfe9baaf6e4615c52377783decd96fd8f48d7d60b5efebfa51c034'
sys.path.insert(0, str(ROOT))
from app.generated_scene import digest, validate_code, validate_subject


def status(path, state, message):
    tmp = path / 'status.generated.tmp'
    tmp.write_text(json.dumps({'state': state, 'message': message}), encoding='utf-8')
    os.replace(tmp, path / 'status.json')


def run_job(path):
    identifier = str(UUID(path.name))
    if path.is_symlink() or path.resolve().parent != LIBRARY.resolve():
        return
    current = json.loads((path / 'status.json').read_text(encoding='utf-8'))
    if current.get('state') != 'approved':
        return
    claim = path / 'generated-claim'
    try:
        claim.mkdir()
    except FileExistsError:
        return
    name = 'whitesheep-scene-' + identifier
    try:
        code_path = path / 'scene.py'
        approval_path = path / 'approval.json'
        if code_path.is_symlink() or approval_path.is_symlink():
            raise ValueError('Linked review files are not allowed')
        code = code_path.read_text(encoding='utf-8')
        approval = json.loads(approval_path.read_text(encoding='utf-8'))['approved_hash']
        if digest(code) != approval:
            raise ValueError('Code changed after approval')
        prompt = json.loads((path / 'asset.json').read_text(encoding='utf-8')).get('prompt', '')
        validate_subject(validate_code(code), prompt)
        image_id = subprocess.run(['docker', 'image', 'inspect', IMAGE, '--format', '{{.Id}}'], check=True, capture_output=True, text=True, timeout=30).stdout.strip()
        if image_id != IMAGE_ID:
            raise ValueError('The expected local Blender image is missing or changed')
        out = PUBLIC / identifier
        out.mkdir(parents=True, exist_ok=True)
        if out.is_symlink() or out.resolve().parent != PUBLIC.resolve():
            raise ValueError('Invalid output directory')
        status(path, 'running', 'Running reviewed code in an offline, isolated Blender container.')
        # All mounts are fixed by the controller; the container has access only to this job.
        mounts = [(path, '/job', False), (out, '/out', False),
                  (code_path, '/approved.py', True),
                  (ROOT / 'app' / 'generated_scene.py', '/app/generated/generated_scene.py', True),
                  (ROOT / 'videolab' / 'generated' / 'scene_api.py', '/app/generated/scene_api.py', True),
                  (ROOT / 'videolab' / 'generated' / 'render_reviewed.py', '/app/render_reviewed.py', True)]
        args = ['docker', 'run', '--rm', '--name', name, '--network', 'none', '--read-only',
                '--label', f'whitesheep.generated-job={identifier}',
                '--user', '10001:10001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                '--cpus', '4', '--memory', '4g', '--pids-limit', '256', '--shm-size', '512m',
                '--tmpfs', '/tmp:size=2g,mode=1777', '--tmpfs', '/home/node:size=128m,uid=10001,gid=10001,mode=0700']
        for source, destination, readonly in mounts:
            args += ['--mount', f'type=bind,src={source.resolve()},dst={destination}' + (',readonly' if readonly else '')]
        # Use the checked immutable image ID, rather than resolving a mutable tag again.
        args += [IMAGE_ID, 'blender', '--background', '--factory-startup', '--threads', '4', '--python-exit-code', '1', '--python', '/app/render_reviewed.py']
        with (path / 'render.log').open('ab') as log:
            subprocess.run(args, check=True, timeout=1200, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
        if not (out / 'render.png').is_file() or not (path / 'object.blend').is_file() or not (path / 'quality.json').is_file():
            raise ValueError('Expected outputs or quality report are missing')
        status(path, 'complete', 'Preview checks passed. Review the rendered image for accuracy.')
    except (OSError, KeyError, ValueError, subprocess.SubprocessError) as exc:
        if isinstance(exc, subprocess.TimeoutExpired):
            try:
                subprocess.run(['docker', 'stop', '--time', '5', name], capture_output=True, timeout=30, check=False)
            except (OSError, subprocess.SubprocessError):
                pass
        detail = str(exc) if isinstance(exc, ValueError) else f'{type(exc).__name__}. See its local render.log.'
        status(path, 'failed', f'Generated scene failed: {detail}')


def main():
    LIBRARY.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    lock = (LIBRARY.parent / '.generated-worker.lock').open('a+b')
    if os.name == 'nt':
        import msvcrt
        if lock.seek(0, 2) == 0:
            lock.write(b'0'); lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            return
    else:
        import fcntl
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return
    # A previous worker can have died after claiming a job. Never silently rerun it.
    for path in LIBRARY.iterdir():
        try:
            UUID(path.name)
            if path.is_dir() and not path.is_symlink() and (path / 'generated-claim').is_dir():
                current = json.loads((path / 'status.json').read_text(encoding='utf-8'))
                if current.get('state') in {'approved', 'running'}:
                    name = 'whitesheep-scene-' + path.name
                    inspection = subprocess.run(['docker', 'inspect', name, '--format', '{{index .Config.Labels "whitesheep.generated-job"}}'], capture_output=True, text=True, timeout=30, check=False)
                    if inspection.returncode == 0 and inspection.stdout.strip() == path.name:
                        subprocess.run(['docker', 'stop', '--time', '5', name], capture_output=True, timeout=30, check=False)
                    status(path, 'failed', 'The prior worker was interrupted. Create and review a new draft to retry.')
        except (OSError, ValueError, KeyError, json.JSONDecodeError, subprocess.SubprocessError):
            continue
    def heartbeat():
        while True:
            try:
                (LIBRARY.parent / '.generated-worker-heartbeat').touch()
            except OSError:
                pass
            time.sleep(3)
    threading.Thread(target=heartbeat, daemon=True).start()
    while True:
        if (LIBRARY.parent / '.generated-worker-stop').exists():
            return
        for path in LIBRARY.iterdir():
            try:
                UUID(path.name)
                if path.is_dir() and not path.is_symlink() and (path / 'generated-queued' / 'ready').is_file():
                    run_job(path)
            except (OSError, ValueError, KeyError, json.JSONDecodeError):
                continue
        time.sleep(3)


if __name__ == '__main__':
    main()
