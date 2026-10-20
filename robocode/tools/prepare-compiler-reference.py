"""Build the fixed ESP32 core once on the developer PC and record GCC recipes."""
import argparse
from pathlib import Path
import subprocess
import os
import shutil
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--cli', required=True)
parser.add_argument('--config', required=True)
parser.add_argument('--assets-only', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
build = root / '.compiler-cache' / 'reference'
build.mkdir(parents=True, exist_ok=True)
command = [args.cli, 'compile', '--config-file', args.config,
           '--fqbn', 'esp32:esp32:esp32', '--build-path', str(build),
           '--verbose', str(root / 'fixtures' / 'blink-1000ms')]
if not args.assets_only:
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    (build / 'build.log').write_text(result.stdout, encoding='utf-8')
    print(result.stdout[-3000:])
    if result.returncode:
        raise SystemExit(result.returncode)
    wire_build = build.parent / 'reference-wire'
    wire_command = [args.cli, 'compile', '--config-file', args.config,
                    '--fqbn', 'esp32:esp32:esp32', '--build-path', str(wire_build),
                    str(root / 'fixtures' / 'wire-smoke')]
    wire_result = subprocess.run(wire_command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    wire_build.mkdir(parents=True, exist_ok=True)
    (wire_build / 'build.log').write_text(wire_result.stdout, encoding='utf-8')
    print(wire_result.stdout[-3000:])
    if wire_result.returncode:
        raise SystemExit(wire_result.returncode)
    wire_objects = list(wire_build.rglob('Wire.cpp.o'))
    if len(wire_objects) != 1:
        raise RuntimeError(f'Expected one Wire.cpp.o in {wire_build}, found {len(wire_objects)}.')
    shutil.copyfile(wire_objects[0], build / 'Wire.o')
    hd44780_source = build.parent / 'hd44780'
    if not (hd44780_source / 'hd44780.cpp').is_file():
        raise RuntimeError(
            f'Missing {hd44780_source}. Download Bill Perry\'s hd44780 library there before preparing compiler assets.'
        )
    hd44780_build = build.parent / 'reference-hd44780'
    hd44780_command = [args.cli, 'compile', '--config-file', args.config,
                       '--fqbn', 'esp32:esp32:esp32', '--build-path', str(hd44780_build),
                       '--libraries', str(build.parent), str(root / 'fixtures' / 'hd44780-smoke')]
    hd44780_result = subprocess.run(hd44780_command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    hd44780_build.mkdir(parents=True, exist_ok=True)
    (hd44780_build / 'build.log').write_text(hd44780_result.stdout, encoding='utf-8')
    print(hd44780_result.stdout[-3000:])
    if hd44780_result.returncode:
        raise SystemExit(hd44780_result.returncode)
    hd44780_objects = list(hd44780_build.rglob('hd44780.cpp.o'))
    if len(hd44780_objects) != 1:
        raise RuntimeError(f'Expected one hd44780.cpp.o in {hd44780_build}, found {len(hd44780_objects)}.')
    shutil.copyfile(hd44780_objects[0], build / 'hd44780.o')
data = Path(os.environ['LOCALAPPDATA']) / 'Arduino15/packages/esp32'
sdk = data / 'tools/esp32-libs/3.3.12'
core = data / 'hardware/esp32/3.3.12'
archive = build.parent / 'board-input-v2.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as output:
    roots = [(sdk / part, 'sdk/' + part) for part in ['include', 'lib', 'ld', 'qio_qspi', 'flags']]
    roots += [
        (core / 'cores/esp32', 'core'),
        (core / 'variants/esp32', 'variant'),
        (core / 'libraries/Wire/src', 'libraries/Wire/src'),
    ]
    for source, target in roots:
        for file in source.rglob('*'):
            if file.is_file():
                output.write(file, target + '/' + file.relative_to(source).as_posix())
    for name in ['LICENSE', 'COPYING']:
        candidate = core / name
        if candidate.is_file():
            output.write(candidate, 'licenses/arduino-' + name)
    hd44780_source = build.parent / 'hd44780'
    for file in hd44780_source.rglob('*.h'):
        output.write(file, 'libraries/hd44780/' + file.relative_to(hd44780_source).as_posix())
    for name in ['LICENSE', 'COPYING']:
        candidate = hd44780_source / name
        if candidate.is_file():
            output.write(candidate, 'licenses/hd44780-' + name)
print('Board assets:', archive, archive.stat().st_size, 'bytes')
