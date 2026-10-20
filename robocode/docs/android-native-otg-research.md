# Phase 3.1 — Android USB Serial and ESP32 Bootloader Research

## Decision

RoboCode's current browser app remains the block editor and Arduino-sketch generator. Native OTG flashing and the serial monitor require an Android app layer: a browser alone is not the dependable place to access a USB-to-UART adapter or control its reset lines.

The first native proof should flash a known-good, prebuilt Blink firmware package to the existing CP2102-based ESP32 board. It should not try to compile arbitrary `.ino` files on-device yet. This separates the risky USB/flashing work from the already working Blockly and ArduinoDroid handoff.

## What the Android layer must do

1. Detect that the phone supports USB host (OTG) mode.
2. List attached USB serial devices and identify the USB chip, vendor ID, and product ID.
3. Ask the user for Android USB access after they select a device.
4. Open the serial port at the requested baud rate.
5. Enter ESP32 download mode, flash the prepared firmware segments at the offsets declared by that firmware package, then reset the board.
6. Re-open the port at 115200 baud and display serial output with a clear Disconnect control.

Android USB permission is temporary and ends when the device disconnects, so the app must request permission again after every reconnect. Android's [`UsbManager`](https://developer.android.com/reference/android/hardware/usb/UsbManager) documents both the USB-host feature check and the permission flow.

## Suitable USB-serial transport

The candidate transport is [`usb-serial-for-android`](https://github.com/mik3y/usb-serial-for-android). It provides Android USB-host serial drivers and explicitly supports the Silicon Labs **CP2102/CP210x** family detected in the Phase 0 test, as well as common FTDI, CH340/CH341, and CDC/ACM devices.

Use its normal device probe first. Keep a visible unsupported-device message rather than attempting a generic connection when no compatible driver is found.

## ESP32 bootloader requirements

The ESP32 must enter Firmware Download mode before it can be flashed. On many development boards, the USB-to-UART adapter's control lines do this automatically:

| USB serial control line | ESP32 signal |
| --- | --- |
| DTR | GPIO0 |
| RTS | EN / CHIP_PU |

The control lines are active-low. Boards with the usual auto-reset circuit can be reset into the serial bootloader by driving this sequence; if automatic entry fails, the UI must show a manual fallback: **hold BOOT, tap RESET, release BOOT when connecting begins**. Espressif documents the automatic-reset wiring and the situations where it cannot work in its [boot-mode guide](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/boot-mode-selection.html).

The flasher must use the chip's UART bootloader protocol, including sync, chip detection, erase/write/verify, and restart. Espressif describes the protocol as SLIP-framed and notes that chip families differ; RoboCode must target the original ESP32 board first and identify the chip before choosing a protocol. See Espressif's [serial-protocol reference](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/serial-protocol.html).

## Firmware package boundary

For the native Blink proof, package the build output with a small manifest. The manifest is the source of truth for chip target, baud rate, and flash offsets; never assume a single binary or hard-code offsets in the phone UI.

```text
blink-firmware/
  manifest.json       # target, baud rate, ordered segments and offsets
  bootloader.bin
  partitions.bin
  app.bin
  boot_app0.bin       # only if the selected Arduino build requires it
```

This is necessary because ESP32 builds commonly consist of multiple flash segments. Espressif's [flashing reference](https://docs.espressif.com/projects/esptool/en/latest/esp32/esptool/flashing-firmware.html) shows these offset-based writes. The exact files and offsets must be produced by the selected board build, not copied from another ESP32 variant.

## Phase 3.2 prototype scope

Build only these screens/actions:

- **Connect:** USB-device name, USB chip, supported/unsupported state, and a user-triggered permission request.
- **Flash Blink:** progress for connect, bootloader, erase/write, verify, and restart; cancel/disconnect safely on failure.
- **Serial Monitor:** selectable baud rate, default 115200, received text, clear output, and disconnect.
- **Recovery:** clear instructions for cable/OTG power issues and the manual BOOT + RESET sequence.

Do not add classroom multi-board management, arbitrary sketch compilation, or a full supported-hardware matrix in this prototype.

## Acceptance test for Phase 3.3

With the existing Android phone, OTG adapter, data cable, and CP2102 ESP32 board:

1. RoboCode identifies the CP2102 device and receives Android USB permission.
2. Flashing the bundled Blink firmware completes and the board's LED blinks.
3. The serial monitor opens at 115200 baud and shows a known test message.
4. Disconnect/reconnect requires a new permission request and succeeds again.
5. If automatic bootloader entry fails, the manual BOOT + RESET path is documented and works.

## Implementation prerequisites

- Android Studio and the Android SDK, for the native Android container/plugin.
- A reproducible ESP32 build that exports the firmware package and manifest.
- The current Phase 0 hardware kit, plus a powered OTG hub only if the phone cannot power the board reliably.

No Android SDK installation is needed for the current browser prototype or ArduinoDroid handoff. Install it only when beginning Phase 3.2.
