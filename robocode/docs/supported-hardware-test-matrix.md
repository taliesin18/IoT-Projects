# Phase 4.1 — supported-hardware test matrix

This matrix separates the single **supported baseline** from hardware that is
only a candidate. A candidate is not presented as supported until it passes the
repeatability tests in Phase 4.2.

## Supported baseline

| Part | Required profile | Status | Evidence |
| --- | --- | --- | --- |
| Android phone | Android 7.0 (API 24) or newer, ARM64 recommended | Baseline passed | RoboCode installed, compiled, flashed, and read serial output on the user's phone. |
| Phone connection | USB-OTG adapter and data-capable USB cable | Baseline passed | Existing OTG setup detected the ESP32 and completed flashing. |
| USB-to-UART bridge | Silicon Labs CP2102 / CP210x | Baseline passed | Android identified the Phase 0 board as CP2102; native RoboCode USB access, flashing, and serial monitoring passed. |
| ESP32 | Original ESP32 (not C3, S2, S3, C2, C6, or H2), 4 MB flash, DIO/80 MHz profile | Baseline passed | Fixed on-phone compiler and flash image target. |
| Built-in LED | GPIO 2 | Baseline passed | RoboCode Blink and generated-sketch workflow passed. |
| External GPIO | GPIO 27 on the tested AirMouse board | Baseline passed | RoboCode GPIO Output was verified with the AirMouse board. |

The present Android app sets a minimum SDK level of API 24. The bundled compiler
also includes an ARM64 phone build and an x86-64 emulator build. It does not
currently support 32-bit Android phones.

## Candidate hardware — test before calling it supported

| Area | Candidate | What must pass | Current status |
| --- | --- | --- | --- |
| USB bridge | CH340 / CH341 | Detection, permission, 115200 serial, automatic-reset flash, and three repeated Compile & flash runs | Untested |
| USB bridge | FTDI | Detection, permission, 115200 serial, automatic-reset flash, and three repeated Compile & flash runs | Untested |
| USB bridge | CDC/ACM | Detection, permission, 115200 serial, automatic-reset flash, and three repeated Compile & flash runs | Untested |
| Phone | A second Android model with USB-OTG | All baseline checks, including reconnect after flash | Untested |
| Cable | A second known data cable | All baseline checks; reject charge-only cables | Untested |
| ESP32 board | A second original-ESP32 4 MB board | Compile, flash, reset, Blink, and serial monitor | Untested |
| AirMouse board | Full board identification and repeatability run | Record chip, flash size, USB bridge, LED pin, exposed GPIOs, and three successful runs | Partially verified: GPIO 27 output works |

## Explicitly outside the current supported profile

- ESP32-C3, C2, C6, H2, S2, S3, P4, and other non-original ESP32 variants.
- Original ESP32 boards with a different flash size or flash configuration.
- 32-bit Android phones.
- Charge-only USB cables.
- Additional Arduino libraries beyond the RoboCode bundled compiler profile.

## Phase 4.2 repeatability procedure

Run this once for every candidate row and add the result to the test log below.

1. Record the phone model, Android version, OTG adapter, cable identifier,
   board name, ESP32 chip, flash size, and USB bridge reported by RoboCode.
2. Connect through OTG and use **Hardware → Connection & serial → Check ESP32**.
3. Select the listed USB device and grant access. Open the serial monitor at
   115200 baud; reset the board and confirm boot output or sketch output.
4. Use **Hardware → Program → Compile & flash** with the one-second Blink
   example. Confirm a successful upload and visible LED behavior.
5. Repeat step 4 three times, including one physical OTG reconnect between
   runs. Record any need to press BOOT or EN/RESET.
6. Run the GPIO 27 external LED/button example where that pin is available;
   otherwise use a documented safe pin for that board.
7. Mark the candidate supported only if all runs pass without an unexplained
   failure. Log repeatable limitations as recovery instructions instead.

## Test log

| Date | Phone / Android | OTG + cable | Board / bridge | Compile & flash (3 runs) | Serial | Result / notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-13 | User's Android phone; model/version not yet recorded | Existing known-good OTG and data cable | Classic ESP32 / CP2102 | Passed during Phase 3.3 acceptance | Passed | Baseline confirmed. |
| 2026-10-13 | User's Android phone; model/version not yet recorded | Existing known-good OTG and data cable | AirMouse board; full profile not yet recorded | GPIO 27 output passed | Not recorded for this board | Complete identification and three-run test remain. |

## Data still needed from the user

Before classroom use, record the phone model/Android version and the exact
AirMouse board/chip/flash-size label. Those facts turn the current working setup
into a reproducible supported baseline instead of a one-device result.
