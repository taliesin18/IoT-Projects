"""Build the emulator's private glibc with supported Android syscalls.

Requires WSL build-essential, bison, gawk and the verified glibc source archive.
Never installs into the Linux host: artifacts remain in the RoboCode build cache.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.compiler-cache'
NATIVE = Path.home() / '.cache/robocode-compiler-esp-2601'
lock = json.loads((ROOT / 'tools/android-glibc.lock.json').read_text())
archive = CACHE / 'glibc-2.44.tar.xz'
CACHE.mkdir(exist_ok=True)
def fetch(url, destination):
    if not destination.exists():
        temporary = destination.with_suffix(destination.suffix + '.part')
        request = urllib.request.Request(url, headers={'User-Agent': 'RoboCode-compiler-build/1.0'})
        with urllib.request.urlopen(request, timeout=90) as response, temporary.open('wb') as output:
            shutil.copyfileobj(response, output)
        temporary.replace(destination)
fetch(lock['source'], archive)
if hashlib.sha256(archive.read_bytes()).hexdigest() != lock['sourceSha256']:
    raise RuntimeError('glibc source checksum mismatch')
patches = [CACHE / 'set-nptl-syscalls.patch', ROOT / 'tools/glibc-x86_64-android.patch']
fetch('https://raw.githubusercontent.com/termux/glibc-packages/main/gpkg/glibc/set-nptl-syscalls.patch', patches[0])
if hashlib.sha256(patches[0].read_bytes()).hexdigest() != '14d7992108e5dc0dfc628ae93f7be4d9f1518b3c3b1699b0a1a0abea017d4f20':
    raise RuntimeError('Upstream Android syscall patch checksum mismatch')
fingerprint = hashlib.sha256(b''.join(p.read_bytes() for p in patches)).hexdigest()[:12]
work = NATIVE / ('glibc-android-' + fingerprint)
# Reuse a successfully configured tree when only compatibility patches change.
# Re-extract pristine sources before patching; make rebuilds the changed objects.
previous_metadata = NATIVE / 'custom-glibc-x86_64/source.json'
if previous_metadata.exists():
    previous = json.loads(previous_metadata.read_text())
    candidate = NATIVE / previous.get('buildDirectory', 'glibc-android-' + previous['patchId'])
    if (previous.get('sha256') == lock['sourceSha256']
            and candidate.resolve().parent == NATIVE.resolve()
            and (candidate / 'build/config.status').is_file()):
        work = candidate
work.mkdir(parents=True, exist_ok=True)
source = work / 'glibc-2.44'
if not (source / '.patched').exists() or (source / '.patched').read_text() != fingerprint:
    with tarfile.open(archive) as tar:
        tar.extractall(work, filter='data')
    for patch in patches:
        subprocess.run(['patch', '-p1', '--batch', '-i', str(patch)], cwd=source, check=True)
    (source / '.patched').write_text(fingerprint)
build = work / 'build'
build.mkdir(exist_ok=True)
logfile = work / 'build.log'
def run(command):
    print('Running', command[0], '— log:', logfile, flush=True)
    with logfile.open('a') as log:
        result = subprocess.run([str(arg) for arg in command], cwd=build, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode:
        print(logfile.read_text()[-8000:])
        raise SystemExit(result.returncode)
if not (build / 'config.status').exists():
    run([source / 'configure', '--prefix=/robocode/compiler', '--disable-werror',
         '--disable-nscd', '--disable-profile', '--enable-kernel=4.4',
         '--enable-stack-protector=strong', '--enable-bind-now'])
run(['make', '-j' + str(min(os.cpu_count() or 2, 6))])
destination = NATIVE / 'custom-glibc-x86_64'
destination.mkdir(exist_ok=True)
for relative, name in [('elf/ld.so', 'ld-linux-x86-64.so.2'), ('libc.so', 'libc.so.6'),
                       ('math/libm.so', 'libm.so.6'), ('dlfcn/libdl.so', 'libdl.so.2'),
                       ('nptl/libpthread.so', 'libpthread.so.0'), ('rt/librt.so', 'librt.so.1')]:
    shutil.copyfile(build / relative, destination / name)
    subprocess.run(['strip', '--strip-debug', str(destination / name)], check=True)
for name in ['COPYING', 'COPYING.LIB', 'LICENSES']:
    if (source / name).is_file():
        shutil.copyfile(source / name, destination / name)
for patch in patches:
    shutil.copyfile(patch, destination / patch.name)
(destination / 'source.json').write_text(json.dumps(dict(source=lock['source'], sha256=lock['sourceSha256'], patchId=fingerprint, buildDirectory=work.name), indent=2))
print('Built private emulator runtime:', destination, flush=True)
