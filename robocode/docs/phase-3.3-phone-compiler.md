# Phase 3.3: compilation inside the RoboCode APK

**Development status (2026-10-13):** the normal bundled-compiler APK passes the
offline Android emulator suite: six tests passed, no failures, and one opt-in
tracing test skipped. This includes compiling two different Arduino C++ sketches,
syntax/linker error handling, and the actual Blockly → Compile on phone → flash
image UI flow. The exported Android-built ELF converts byte-for-byte identically
to Espressif esptool. Both x86-64 and ARM64 Linux packaging checks pass.
The APK is ready for the physical ARM64 phone/OTG beta acceptance steps below;
those hardware checks are still outstanding.

Validated APK: `web/android/app/build/outputs/apk/debug/app-debug.apk`,
102,346,324 bytes. SHA-256:
`024fea902f0bd47e720c57a69da1a530f60326bb246bcf02800e2a409cde390e`.

## Phone workflow

1. Install the debug APK built with the compiler bundle.
2. In **Build**, load Blink and change the ON delay to 317 ms and OFF delay to 683 ms. The generated sketch should show those values.
3. In **Hardware**, choose **Compile on phone**. The first run unpacks the compiler data; allow extra time and keep the app open. Later runs reuse that data.
4. Confirm that the result says **Compiled on this phone** and shows the firmware size and sketch identifier.
5. Connect the existing classic ESP32/CP2102 board through OTG, choose **Check ESP32**, and select/authorize its adapter.
6. Choose **Compile & flash**. The app compiles the current Arduino C++, creates a matching flash image, writes the complete firmware bundle, and resets the board.
7. Confirm the changed blink pattern. Change a delay again and repeat to prove that the firmware follows the blocks.
8. Repeat with Wi-Fi and mobile data switched off. No PC service or companion app should be running.

Use a saved project before installing test builds. This beta targets the Phase 0 classic ESP32, 4 MB flash, DIO, 80 MHz, GPIO 2 LED. It rejects a different chip before writing flash data. Generated Blink has no serial print statements; an empty serial monitor after boot is expected for that program.

## What is compiled

Blockly's generated Arduino C++ is written as a C++ source file and passed to the bundled Espressif GCC frontend, assembler, and linker. The Arduino core and fixed board libraries are prebuilt once by the developer, as reusable static libraries. Every submitted sketch is compiled again on the phone. There is no LED-program interpreter or patched Blink template.

The initial profile is `esp32:esp32:esp32`, Arduino-ESP32 3.3.12, Espressif `esp-x32` 2601 / GCC 14.2.0. It accepts the generated sketch, including `Arduino.h`; it does not provide a general Arduino library manager or automatic `.ino` function-prototype preprocessing.

Tools are included in the APK's extracted native library directory. The compiler headers, target archives, linker scripts, boot images, and build recipe are included in `assets/compiler/esp32.zip`. Writable project storage contains only data and temporary compilation outputs. Compiles run on a background worker with bounded output and a timeout. The installed board data is excluded from Android backup, and older extracted bundle versions are cleaned up after an update succeeds.

The official Espressif Linux compiler runs with a private Android-adapted glibc runtime. ARM64 uses the pinned open-source Termux glibc package; x86-64 uses verified GNU glibc source with upstream Android thread patches and local file-operation compatibility fixes. The runtime is bundled as libraries; users do **not** install or launch Termux. APK native libraries contain both ARM64 and x86-64 builds. Android 8+ is required by the compiler; physical device compatibility remains part of acceptance testing.

## Developer preparation

See [tools/README.md](../tools/README.md) for the reference compile and bundle preparation. Generated archives and native tools are ignored by Git. They must be prepared on a new checkout before building the APK.

From `robocode/web`, run `npm run android:sync`. In Android Studio, open `web/android`, select a Java 21 Gradle runtime, and build the debug APK. The output is `web/android/app/build/outputs/apk/debug/app-debug.apk`.

## Verification

- `npm test`: generator, project serialization, and malformed firmware input tests.
- The packaging script actually compiles, assembles, and links Blink with both packaged tool versions. ARM64 is exercised with QEMU in the Linux build environment.
- `:app:connectedDebugAndroidTest`: compiles two different C++ programs inside Android, verifies Xtensa ELF output, rejects invalid C++, checks bundle path confinement, and presses the actual app's **Compile on phone** button through the WebView test.
- `test/esp32-image.test.js` can compare a resulting ELF conversion byte for byte against official esptool. Set `ROBOCODE_REFERENCE_ELF` to the ELF path and generate its sibling `.bin` using `esptool --chip esp32 elf2image --flash-mode dio --flash-freq 80m --flash-size 4MB --elf-sha256-offset 0xb0`.
- Final hardware acceptance is the phone workflow above. Emulator compilation does not establish physical ARM64 phone or OTG compatibility.

The passing Android run used the API 37 x86-64 emulator with Wi-Fi and mobile
data disabled and airplane mode enabled. The diagnostic native tracer was
excluded from the APK. If this workstation's emulator clock jumps backward or
hangs during WebView startup, cold-start the AVD with one virtual CPU (`-cores 1`);
that was the stable configuration for this run.

## Runtime packaging findings

The first startup crash came from following Debian's absolute loader symlink into the developer machine's own runtime. Selecting only libraries inside the extracted package fixes that mismatch. A separate Android failure came from desktop glibc's unsupported startup syscalls. The Android-adapted runtime includes upstream compatibility patches for those calls, so the app does not need to change Android security settings.

Android traces identified legacy x86-64 `access` at compiler startup and `chmod`
after the linker wrote the completed ELF. The local runtime uses `faccessat`
and `fchmodat` instead, plus `readlinkat` and `unlinkat` for compatible file
operations. These are runtime portability changes, not changes to Android's
security policy or the application's target SDK.

The linker error-cleanup path also required replacing legacy `lstat` in the
compatibility wrapper with `newfstatat(..., AT_SYMLINK_NOFOLLOW)`. The regression
test now verifies that an undefined function produces the actual linker message,
not SIGSYS or an apparently successful firmware result.

Sources: [Android executable-code restrictions](https://developer.android.com/about/versions/10/behavior-changes-10#execute-permission), [Espressif compiler releases](https://github.com/espressif/crosstool-NG/releases), [Android glibc build recipes and patches](https://github.com/termux/glibc-packages/tree/main/gpkg/glibc), [ESP32 firmware image format](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/firmware-image-format.html).
