"""Optional x86-64 Android tracer for compiler development, never for release APKs.

Run in WSL. Packages are verified using the cached official Termux package index.
Only shared libraries and the strace executable enter the debug source set.
"""
import hashlib
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.compiler-cache'
packages = {}
for stanza in (CACHE / 'termux-main-x86_64-Packages').read_text().split('\n\n'):
    fields = dict(line.split(': ', 1) for line in stanza.splitlines()
                  if ': ' in line and not line.startswith(' '))
    if 'Package' in fields:
        packages.setdefault(fields['Package'], fields)
destination = ROOT / 'web/android/app/src/debug/jniLibs/x86_64'
destination.mkdir(parents=True, exist_ok=True)
extracted = Path.home() / '.cache/robocode-compiler-esp-2601/android-tracer'
extracted.mkdir(parents=True, exist_ok=True)
for name in ['strace', 'libdw', 'libelf', 'argp', 'libbz2', 'liblzma',
             'libandroid-support', 'zlib', 'zstd', 'json-c', 'ncurses']:
    info = packages[name]
    package = CACHE / Path(info['Filename']).name
    if hashlib.sha256(package.read_bytes()).hexdigest() != info['SHA256']:
        raise RuntimeError('Checksum mismatch: ' + str(package))
    subprocess.run(['dpkg-deb', '-x', str(package), str(extracted)], check=True)
prefix = extracted / 'data/data/com.termux/files/usr'
shutil.copyfile(prefix / 'bin/strace', destination / 'librc_strace.so')
for library in (prefix / 'lib').glob('*.so'):
    if library.is_file() and library.resolve().is_relative_to(extracted.resolve()):
        shutil.copyfile(library, destination / library.name)
print('Debug tracer:', destination)
