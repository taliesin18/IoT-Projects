# RoboCode

RoboCode is a block-programming prototype for ESP32 projects. The shared Blockly editor generates Arduino C++, and the Android app adds local compilation, USB flashing, and a serial monitor.

## Run locally

```powershell
cd robocode\web
npm run dev
```

## Verify

```powershell
npm test
npm run build
```

The known-good expected output is in `fixtures/blink-1000ms/blink-1000ms.ino`.

## Save and load projects

Use **Save project** to download a portable `robocode-project.json` file. Use **Load project** to restore that file into the workspace. The JSON contains blocks only; generated Arduino code is recreated locally when the project is opened.

## Use the sketch on Android

Use **Download .ino** to save the generated sketch as `robocode_blink.ino`. On an Android phone, open the downloaded file in ArduinoDroid, select the existing ESP32 target, then compile and upload through the known-good OTG connection.

## Native Android OTG work

The [Phase 3.1 research and design](docs/android-native-otg-research.md) records the requirements for eventual in-app ESP32 flashing and serial monitoring. It deliberately keeps the current browser prototype independent of Android SDK tooling.

## Android app wrapper

The existing Vite app is packaged for Android with Capacitor; Blockly and the Arduino generator remain shared web code. From `robocode/web`:

```powershell
npm run android:sync
npm run android:open
```

`android:sync` builds the Vite app and copies it into the Android project. The native USB and compiler plugins expose Android capabilities to the existing web UI without duplicating the Blockly editor.

### Build a debug APK

In Android Studio, open `robocode/web/android`. Set **Gradle JDK** to a Java 21 runtime, then use **Build → Build APK(s)**. The resulting test APK is created at `android/app/build/outputs/apk/debug/app-debug.apk`.

The compiler binaries and data must be prepared separately before building an APK with phone compilation. See [the phone compiler guide](docs/phase-3.3-phone-compiler.md). A normal web build does not download the compiler.

### USB connection beta

The Android app detects supported USB serial adapters, including the CP2102 used by the Phase 0 board, and requests Android USB access only after the user taps **Allow USB access**. In the RoboCode Android app, connect the ESP32 through OTG, choose **Check ESP32**, grant permission for the listed device, then open the Serial Monitor. It defaults to 115200 baud; resetting the ESP32 should show its boot output.

### Native ESP32 flashing beta

The Hardware tab can now flash an ESP32 application binary without ArduinoDroid. Start with **Flash RoboCode Blink test**: it writes a bundled, matching bootloader, partition table, OTA selector, and GPIO 2 Blink app to the standard classic-ESP32 addresses. It prints `LED ON` and `LED OFF` at 115200 baud, so Serial Monitor verifies the result even if a board's built-in LED is wired differently. This first test expects the same classic ESP32 / CP2102 board used in Phase 0.

If the board does not automatically enter download mode, hold **BOOT**, tap **EN/RESET** once, release **BOOT**, and tap Flash again. After a successful flash, open Serial Monitor at 115200 baud to verify the program's output. **Flash app .bin** is for an ESP32 application binary compiled for the same board; it is deliberately not a generic full-device firmware installer yet.

The implementation uses Espressif's Apache-2.0 licensed `esptool-js` package inside the Android app, while the Capacitor USB bridge owns Android's CP2102 connection. A successful on-device Blink flash is the acceptance test before we add RoboCode's native sketch compilation and automatic app-binary generation.

## Phase 3.3 — Compile on the phone

The bundled compiler and full Compile-button flow pass offline Android emulator
tests. Physical ARM64 phone and ESP32 acceptance of this new compiler build is
the next beta check; see the guide for the exact tested APK and limitations.

With the bundled-compiler APK, use **Hardware → Compile on phone** to compile the current blocks without an ESP32 attached. Connect the Phase 0 board, select its USB adapter, and choose **Compile & flash** to compile and upload in one operation. No PC service, internet connection, or companion app is required at runtime.

The first fixed target is the classic ESP32 with 4 MB flash and a GPIO 2 LED. The APK includes ARM64 phone tools and x86-64 emulator tools. Other ESP32 chips, 32-bit phones, and installing additional Arduino libraries are not included in this beta. See [the setup, tests, and acceptance checklist](docs/phase-3.3-phone-compiler.md).

## Phase 4 — First external GPIO block

The **GPIO Output** toolbox category provides `set GPIO … HIGH/LOW` for an
external LED, relay module, or another simple digital output. It offers only
safe common output pins for the current classic ESP32 profile: 16–19, 21–23,
25–27, 32, and 33. RoboCode automatically generates the matching
`pinMode(pin, OUTPUT)` line in `setup()`.

For a first external LED test, connect the selected GPIO through a 220–330 Ω
resistor to the LED's positive leg, then connect the LED's other leg to GND.
Avoid using the new block with a relay until the relay module's power and input
voltage requirements are confirmed.

### Button input and decisions

The **Control** category now has a reusable `if … then / otherwise` block.
The **Input** category's `button on GPIO … is pressed` block plugs into its
condition slot. RoboCode configures that button pin as `INPUT_PULLUP`, so wire
one side of a normally open pushbutton to the chosen GPIO and the other side to
GND—no separate resistor is required. A pressed button reads as true.

Do not use the same GPIO for both a button and a GPIO Output block in one
program. For a first test, use GPIO 27 for the button and an external LED on
GPIO 16 for the output.

The Blockly vocabulary does not assume that a board has a built-in LED. Use
**GPIO Output** for every LED or other output, including a board-specific
onboard LED once its actual pin is documented. **START** is the program's
repeating Arduino `loop()`; **Control** adds `repeat … times` for a visible
nested loop, and **Serial** provides `serial print line …`, automatically
initializing the serial monitor at 115200 baud.

Use **Variables** to create project-local whole-number values. `set local`,
`change local`, and `local` work with repeat counts and **Serial → serial print
value**. Use **Variables → Create local variable…** to make another named
value. Use **Copy blocks** after selecting a block stack, then **Paste
blocks** to duplicate it in the current workspace. The normal Blockly keyboard
shortcuts remain available too.

### Single-wire ultrasonic sensor

The **Sensors** category supports a four-pin ultrasonic module labelled
**GND, VCC, NC, SIG**. This is a single-wire sensor: its `SIG` connection is
used first as the trigger signal and then as the echo input. The block stores a
whole-number distance in centimeters in a local variable. It stores `-1` if no
echo arrives within 30 ms.

For the confirmed setup, connect the sensor's `SIG` pin to **GPIO 26** and the
light or LED input to **GPIO 27**. In Blockly, create a local variable named
`distance`, then use this program shape:

```text
START
  measure ultrasonic SIG GPIO 26 into local distance
  if value local distance is less than number 10 then
    set GPIO 27 HIGH
  otherwise
    set GPIO 27 LOW
  wait 100 milliseconds
```

Use separate GPIO pins for the ultrasonic `SIG` connection and every output.
This block matches the supplied, working one-wire sensor sketch; it is not for
two-wire Trigger/Echo HC-SR04 wiring.

The [Phase 4.1 supported-hardware test matrix](docs/supported-hardware-test-matrix.md)
defines the confirmed baseline, candidate devices, and the repeatability
procedure required before a setup is called classroom-ready.

### Optional developer PC compiler

RoboCode can now send the generated block sketch to a small compiler service running on the prepared PC, receive the complete classic-ESP32 firmware bundle, and flash it through the Android app. This is a local-Wi-Fi development workflow: the phone, PC, and ESP32 stay in your own network; no source code is sent to a cloud compiler.

From `robocode/web`, start the service with the Arduino CLI paths already prepared on this PC:

```powershell
$env:ARDUINO_CLI_PATH = 'C:\work\local\tools\arduino-cli\arduino-cli.exe'
$env:ARDUINO_CLI_CONFIG = 'C:\work\local\tools\arduino-cli\arduino-cli.yaml'
npm run compiler
```

Copy the **Phone URL** and **Access token** it prints into **Hardware → Developer PC compiler (optional)** in the RoboCode Android app. Select the CP2102 device, choose **Check compiler**, then choose **Compile blocks & flash**.

See [the Phase 3.3 setup guide](docs/phase-3.3-local-compiler.md) for security notes, recovery, and the exact firmware segments.

### Laptop compile and upload beta

The same local compiler can now upload from a laptop browser without opening
Arduino IDE. Start `npm run compiler` on the laptop, open RoboCode in that
laptop's browser, and open **Hardware → Advanced → Developer PC compiler**.
Enter `http://localhost:8787` and the token printed by the compiler, then use
**Laptop Browser → Find COM ports** and **Compile & upload from laptop**.

This is deliberately a beta path: it supports the same classic ESP32 profile
as the Android app and does not yet provide a laptop Serial Monitor. Keep
**Download .ino** as the fallback for Arduino IDE, troubleshooting, and
unsupported boards.

### I2C 16x2 LCD and servo blocks — untested beta

The **Display** category includes text, number, and clear blocks for common
PCF8574 I2C 16x2 LCD backpacks. Enter the address reported by the scanner in
each LCD block—`0x27`, `0x3F`, and your `0x3E` are all accepted. Decimal input
is also accepted, then saved as hexadecimal. RoboCode validates standard I2C
addresses from `0x03` through `0x77`.

RoboCode uses the classic ESP32 I2C pins: **GPIO 21 (SDA)** and **GPIO 22
(SCL)**. Do not also assign those pins to another block. Before connecting an
LCD backpack powered at 5 V, confirm that its SDA/SCL pull-ups are safe at 3.3
V or use an I2C level shifter; an unmodified 5 V I2C signal can damage an
ESP32 GPIO.

The **GPIO Output** category includes `move servo on GPIO … to … degrees` for
standard hobby servos. It supports GPIO 16–19, 21–23, and 25–27. Power the
servo from a suitable separate 5 V supply, connect that supply's ground to
ESP32 GND, and connect only the servo signal wire to the selected GPIO. Do not
power a servo from the ESP32 board or the phone's OTG connection.

Both profiles use code generated from Arduino/ESP32 core features rather than
additional Arduino libraries. They build into the app but still require a
physical acceptance test with the actual LCD and servo before being treated as
supported classroom hardware.

Use **Display → scan I2C devices once** before choosing an LCD address. Flash
that program, then open RoboCode Serial Monitor at 115200 baud. It prints each
responding address, for example `I2C device: 0x3E`, only once after boot. The
scan confirms that a device responds at that address; it does not identify the
device type. A result of `No I2C devices found.` means to check the LCD power,
shared ground, SDA/SCL wiring, and I2C voltage level before trying another
address.
