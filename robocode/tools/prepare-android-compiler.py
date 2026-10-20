"""Prepare APK-only classic ESP32 compiler. Run in WSL/Linux after reference build.

Downloads are verified against upstream SHA256 metadata. Host executables stay in
jniLibs; only headers, target archives and link scripts enter the data ZIP.
"""
import argparse
import concurrent.futures
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import tarfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.compiler-cache'
NATIVE_CACHE = Path.home() / '.cache/robocode-compiler-esp-2601'
DATA = Path('/mnt/c/Users/Taliesin/AppData/Local/Arduino15')
ANDROID = ROOT / 'web/android/app/src/main'
VERSION = '3.3.12'
BOARD_INPUT_MARKER = '.board-input-v4'
HOSTS = {'x86_64': 'x86_64-pc-linux-gnu', 'arm64-v8a': 'aarch64-linux-gnu'}

def run(args, **kwargs):
    result = subprocess.run([str(x) for x in args], capture_output=True, text=True, **kwargs)
    if result.returncode:
        raise RuntimeError(f'{args[0]} failed:\n{result.stdout}\n{result.stderr}')
    return result.stdout

def download(url, dest, checksum=None):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        print('Downloading', url, flush=True)
        temp = dest.with_suffix(dest.suffix + '.part')
        request = urllib.request.Request(url, headers={'User-Agent': 'RoboCode-compiler-build/1.0'})
        with urllib.request.urlopen(request, timeout=90) as response, temp.open('wb') as output:
            shutil.copyfileobj(response, output)
        temp.replace(dest)
    if checksum and hashlib.file_digest(dest.open('rb'), 'sha256').hexdigest() != checksum.lower():
        raise RuntimeError(f'Checksum mismatch: {dest}')
    return dest

def host_tools(abi):
    index = json.loads((DATA / 'package_esp32_index.json').read_text())
    package = next(p for p in index['packages'] if p['name'] == 'esp32')
    tool = next(t for t in package['tools'] if t['name'] == 'esp-x32' and t['version'] == '2601')
    system = next(s for s in tool['systems'] if s['host'] == HOSTS[abi])
    archive = download(system['url'], CACHE / system['archiveFileName'], system['checksum'].split(':')[1])
    dest = NATIVE_CACHE / abi
    if not (dest / '.extracted').exists():
        dest.mkdir(parents=True, exist_ok=True)
        with tarfile.open(archive) as tar:
            members = (m for m in tar if '/picolibc/' not in m.name)
            tar.extractall(dest, members=members, filter='data')
        (dest / '.extracted').touch()
    return dest / 'xtensa-esp-elf'

def debian_runtime(abi):
    arch = 'arm64' if abi == 'arm64-v8a' else 'amd64'
    index_file = download(f'https://deb.debian.org/debian/dists/bookworm/main/binary-{arch}/Packages.gz', CACHE / f'debian-{arch}-Packages.gz')
    packages = {}
    for stanza in gzip.decompress(index_file.read_bytes()).decode().split('\n\n'):
        fields = dict(line.split(': ', 1) for line in stanza.splitlines() if ': ' in line and not line.startswith(' '))
        if 'Package' in fields:
            packages[fields['Package']] = fields
    dest = NATIVE_CACHE / ('runtime-' + abi)
    dest.mkdir(parents=True, exist_ok=True)
    # Runtime libraries for official Espressif host binaries. No binaries are
    # borrowed from an installed third-party Android application.
    for name in ['libc6', 'libstdc++6', 'libgcc-s1', 'zlib1g', 'libzstd1']:
        info = packages[name]
        deb = download('https://deb.debian.org/debian/' + info['Filename'], CACHE / Path(info['Filename']).name, info['SHA256'])
        run(['dpkg-deb', '-x', deb, dest])
    return dest

def android_glibc(abi):
    if abi == 'x86_64':
        custom = NATIVE_CACHE / 'custom-glibc-x86_64'
        if not (custom / 'source.json').is_file():
            raise RuntimeError('Run tools/build-emulator-glibc.py before packaging x86_64')
        return custom
    # This is a build-time library dependency, not a Termux companion app.
    # Upstream adapts glibc's unsupported Android syscalls to ENOSYS/fallbacks:
    # https://github.com/termux/glibc-packages/tree/main/gpkg/glibc
    arch = 'aarch64' if abi == 'arm64-v8a' else 'x86_64'
    lock = json.loads((ROOT / 'tools/android-glibc.lock.json').read_text())
    base = lock['repository']
    info = dict(lock['packages'][arch], Version=lock['version'], Architecture=arch,
                Recipe=lock['recipe'], Source=lock['source'], SourceSHA256=lock['sourceSha256'])
    deb = download(base + info['Filename'], CACHE / Path(info['Filename']).name, info['SHA256'])
    dest = NATIVE_CACHE / ('android-glibc-' + abi)
    dest.mkdir(parents=True, exist_ok=True)
    run(['dpkg-deb', '-x', deb, dest])
    (dest / 'package-metadata.json').write_text(json.dumps(info, indent=2))
    return dest

def package_native(abi, tool, runtime, glibc):
    dest = ANDROID / 'jniLibs' / abi
    dest.mkdir(parents=True, exist_ok=True)
    candidates = {
        'librc_cc1plus.so': next(tool.glob('libexec/gcc/xtensa-esp-elf/*/cc1plus')),
        'librc_as.so': tool / 'bin/xtensa-esp-elf-as',
        'librc_ld.so': tool / 'bin/xtensa-esp-elf-ld',
        'librc_xtensa.so': tool / 'lib/xtensa_esp32.so',
    }
    aliases = {
        'libc.so.6': 'librc_c.so', 'libm.so.6': 'librc_m.so',
        'libgcc_s.so.1': 'librc_gcc_s.so', 'libstdc++.so.6': 'librc_stdcxx.so',
        'libpthread.so.0': 'librc_pthread.so', 'libdl.so.2': 'librc_dl.so',
        'librt.so.1': 'librc_rt.so', 'libz.so.1': 'librc_z.so',
        'libzstd.so.1': 'librc_zstd.so',
        ('ld-linux-aarch64.so.1' if abi == 'arm64-v8a' else 'ld-linux-x86-64.so.2'): 'librc_loader.so',
    }
    for soname, name in aliases.items():
        # Debian's /lib64 loader alias is an absolute symlink. Following it here
        # would silently copy the build machine's loader instead of the matching
        # Debian loader, mixing glibc versions and crashing before main().
        files = []
        for root in [glibc, runtime]:
            files = [p for p in root.rglob(soname) if p.is_file() and not p.is_symlink()]
            if not files:
                files = [p.resolve() for p in root.rglob(soname)
                         if p.is_file() and p.resolve().is_relative_to(root.resolve())]
            if files:
                break
        if not files:
            raise RuntimeError(f'Missing runtime library {soname}')
        candidates[name] = files[0]
    for name, source in candidates.items():
        shutil.copyfile(source, dest / name)
        (dest / name).chmod(0o755)
    # Verify all dynamic dependencies are packaged; Android cannot supply glibc.
    for native in dest.glob('*.so'):
        needed = re.findall(r'Shared library: \[(.*?)\]', run(['readelf', '-d', native]))
        missing = set(needed) - aliases.keys()
        if missing:
            raise RuntimeError(f'{native.name}: missing {missing}')
    return aliases

def prepare_profile(tool, aliases):
    reference = CACHE / 'reference'
    bundle = NATIVE_CACHE / 'bundle'
    bundle.mkdir(exist_ok=True)
    sdk = DATA / 'packages/esp32/tools/esp32-libs' / VERSION
    core = DATA / 'packages/esp32/hardware/esp32' / VERSION
    def copy_tree(source, target):
        if (target / '.copied').exists():
            return
        shutil.copytree(source, target, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns('esp32s2', 'esp32s3', '*.exe', '*.dll'))
        (target / '.copied').touch()
    if not (bundle / BOARD_INPUT_MARKER).exists():
        with zipfile.ZipFile(CACHE / 'board-input-v2.zip') as archive:
            archive.extractall(bundle)
        (bundle / BOARD_INPUT_MARKER).touch()
    for name in ['xtensa-esp-elf/include', 'xtensa-esp-elf/lib', 'lib/gcc/xtensa-esp-elf/14.2.0']:
        copy_tree(tool / name, bundle / 'tool' / name)
    copy_tree(tool / 'share/licenses', bundle / 'licenses/toolchain')
    for name in ['LICENSE', 'COPYING', 'NOTICE']:
        if (core / name).is_file():
            shutil.copyfile(core / name, bundle / ('licenses/arduino-' + name))
    for abi in HOSTS:
        notices = NATIVE_CACHE / ('runtime-' + abi) / 'usr/share/doc'
        for notice in notices.glob('*/copyright'):
            destination = bundle / 'licenses/debian' / abi / notice.parent.name
            destination.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(notice, destination / 'copyright')
        glibc = NATIVE_CACHE / ('android-glibc-' + abi)
        destination = bundle / 'licenses/android-glibc' / abi
        destination.mkdir(parents=True, exist_ok=True)
        if abi == 'x86_64':
            custom = NATIVE_CACHE / 'custom-glibc-x86_64'
            for notice in custom.iterdir():
                if notice.is_file() and (notice.suffix in ['.json', '.patch'] or notice.name in ['COPYING', 'COPYING.LIB', 'LICENSES']):
                    shutil.copyfile(notice, destination / notice.name)
            continue
        shutil.copyfile(glibc / 'package-metadata.json', destination / 'package-metadata.json')
        for license_dir in glibc.rglob('share/licenses/glibc'):
            shutil.copytree(license_dir, destination, dirs_exist_ok=True)
    shutil.copyfile(reference / 'core/core.a', bundle / 'core.a')
    shutil.copyfile(reference / 'Wire.o', bundle / 'Wire.o')
    shutil.copyfile(reference / 'hd44780.o', bundle / 'hd44780.o')
    for source, target in [('blink-1000ms.ino.bootloader.bin', 'bootloader.bin'),
                           ('blink-1000ms.ino.partitions.bin', 'partitions.bin'),
                           ('boot_app0.bin', 'boot_app0.bin')]:
        shutil.copyfile(reference / source, bundle / target)
    job = NATIVE_CACHE / 'smoke-job'
    job.mkdir(exist_ok=True)
    shutil.copyfile(ROOT / 'fixtures/hd44780-smoke/hd44780-smoke.ino', job / 'sketch.cpp')

    def posix(value):
        value = re.sub(r'/+', '/', value.replace('\\', '/'))
        return re.sub(r'([A-Za-z]):/', lambda m: '/mnt/' + m[1].lower() + '/', value)
    replacements = [
        (str(sdk), str(bundle / 'sdk')),
        (str(core / 'cores/esp32'), str(bundle / 'core')),
        (str(core / 'variants/esp32'), str(bundle / 'variant')),
        (str(DATA / 'packages/esp32/tools/esp-x32/2601'), str(tool)),
        (str(reference / 'sketch/blink-1000ms.ino.cpp.o'), str(job / 'sketch.o')),
        (str(reference / 'sketch/blink-1000ms.ino.cpp'), str(job / 'sketch.cpp')),
        (str(reference / 'core/core.a'), str(bundle / 'core.a')),
        (str(reference / 'blink-1000ms.ino.elf'), str(job / 'sketch.elf')),
        (str(reference / 'blink-1000ms.ino.map'), str(job / 'sketch.map')),
        (str(ROOT / 'fixtures/blink-1000ms'), str(job)),
    ]
    def transform(value):
        value = posix(value)
        for old, new in replacements:
            value = value.replace(old, new)
        return value.replace('ARDUINO_HOST_OS="windows"', 'ARDUINO_HOST_OS="android"')
    def expand_response(args):
        result = []
        for arg in args:
            if arg.startswith('@'):
                response = Path(posix(arg[1:])).read_text()
                result.extend(expand_response(shlex.split(response)))
            else:
                result.append(transform(arg))
        return result
    compile_args = json.loads((reference / 'compile_commands.json').read_text())[0]['arguments']
    compile_args = expand_response(compile_args)
    log = (reference / 'build.log').read_text()
    link_line = next(line for line in log.splitlines() if '--start-group' in line and 'g++' in line)
    link_args = expand_response(shlex.split(link_line))
    def expanded_commands(args):
        result = subprocess.run(args + ['-###'], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stderr)
        return [shlex.split(line) for line in result.stderr.splitlines() if line.startswith(' ') and ('cc1plus' in line or '/as ' in line or 'collect2' in line)]
    commands = expanded_commands(compile_args)
    cpp = next(c[1:] for c in commands if 'cc1plus' in c[0])
    assembler = next(c[1:] for c in commands if c[0].endswith('/as'))
    # GCC's temporary assembly path must become a deterministic job file.
    asm_path = cpp[cpp.index('-o') + 1]
    cpp = [str(job / 'sketch.s') if a == asm_path else a for a in cpp]
    assembler = [str(job / 'sketch.s') if a == asm_path else a for a in assembler]
    # cc1plus is invoked directly in Android, so pass its system include roots.
    includes = subprocess.run([compile_args[0], '-E', '-x', 'c++', '-v', '-'], input='', capture_output=True, text=True).stderr
    search = includes.split('#include <...> search starts here:')[1].split('End of search list.')[0]
    for line in search.splitlines():
        directory = line.strip()
        if directory:
            normalized = str(Path(directory).resolve())
            if not normalized.startswith(str(tool)):
                raise RuntimeError('Unexpected system include path: ' + directory)
            cpp.extend(['-isystem', normalized.replace(str(tool), str(bundle / 'tool'))])
    cpp.extend(['-I', str(bundle / 'libraries/Wire/src'), '-I', str(bundle / 'libraries/hd44780')])
    link = next(c[1:] for c in expanded_commands(link_args) if 'collect2' in c[0])
    # LTO is disabled by this board profile; call the linker directly.
    clean = []
    skip = False
    for arg in link:
        if skip:
            skip = False
            continue
        if arg == '-plugin':
            skip = True
        elif arg.startswith('-plugin-opt=') or arg == '-fno-lto':
            continue
        else:
            clean.append(arg.replace(str(tool), str(bundle / 'tool')))
    sketch_object = str(job / 'sketch.o')
    try:
        sketch_index = clean.index(sketch_object)
        clean[sketch_index + 1:sketch_index + 1] = [str(bundle / 'Wire.o'), str(bundle / 'hd44780.o')]
    except ValueError:
        raise RuntimeError('Could not locate the sketch object in the ESP32 link recipe.')
    def tokens(arg):
        arg = arg.replace(str(tool), str(bundle / 'tool'))
        while re.search(r'/[^/]+/\.\./', arg):
            arg = re.sub(r'/[^/]+/\.\./', '/', arg)
        return arg.replace(str(bundle), '${bundle}').replace(str(job), '${job}').replace('=xtensa_esp32.so', '=${native}/librc_xtensa.so')
    manifest = {'id': 'esp32-3.3.12-v3', 'fqbn': 'esp32:esp32:esp32',
                'nativeLibraries': aliases,
                'stages': [{'tool': name, 'args': [tokens(a) for a in args]}
                           for name, args in [('librc_cc1plus.so', cpp), ('librc_as.so', assembler), ('librc_ld.so', clean)]]}
    serialized = json.dumps(manifest, indent=2)
    if '/mnt/' in serialized or 'C:' in serialized:
        raise RuntimeError('A developer-machine path leaked into the compiler profile:\n' + serialized)
    (bundle / 'manifest.json').write_text(serialized)
    # Debug symbols in prebuilt target archives are not needed on the phone.
    if not (bundle / '.stripped').exists():
        for archive in bundle.rglob('*.a'):
            run([tool / 'bin/xtensa-esp-elf-strip', '--strip-debug', archive])
        (bundle / '.stripped').touch()
    run([tool / 'bin/xtensa-esp-elf-strip', '--strip-debug', bundle / 'Wire.o'])
    run([tool / 'bin/xtensa-esp-elf-strip', '--strip-debug', bundle / 'hd44780.o'])
    # Execute exactly the packaged profile on Linux first, including ARM64 via QEMU.
    for abi in HOSTS:
        native = ANDROID / 'jniLibs' / abi
        runtime = NATIVE_CACHE / ('smoke-runtime-' + abi)
        runtime.mkdir(exist_ok=True)
        for soname, name in aliases.items():
            target = native / name
            if target.exists() and not (runtime / soname).exists():
                (runtime / soname).symlink_to(target)
        prefix = ['qemu-aarch64'] if abi == 'arm64-v8a' else []
        for stage in manifest['stages']:
            args = [a.replace('${bundle}', str(bundle)).replace('${job}', str(job)).replace('${native}', str(native)) for a in stage['args']]
            print('Testing', abi, stage['tool'], flush=True)
            run(prefix + [native / 'librc_loader.so', '--library-path', runtime, native / stage['tool']] + args, cwd=job)
        shutil.copyfile(job / 'sketch.elf', CACHE / f'{abi}-blink.elf')
    target = ANDROID / 'assets/compiler/esp32.zip'
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.zip.part')
    with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for source in sorted(bundle.rglob('*')):
            if source.is_file():
                archive.write(source, source.relative_to(bundle))
    temporary.replace(target)
    print('Compiler bundle:', target, target.stat().st_size, 'bytes', flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--download-only', action='store_true')
    opts = parser.parse_args()
    CACHE.mkdir(exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        tools = dict(zip(HOSTS, pool.map(host_tools, HOSTS)))
    aliases = {}
    for abi, tool in tools.items():
        runtime = debian_runtime(abi)
        glibc = android_glibc(abi)
        aliases.update(package_native(abi, tool, runtime, glibc))
    print('Native compiler binaries packaged.', flush=True)
    if not opts.download_only:
        prepare_profile(tools['x86_64'], aliases)
