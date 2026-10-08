# RoboCode

RoboCode is a block-programming prototype for ESP32 projects. Phase 1 turns a minimal Blockly program into a portable Arduino sketch.

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

`android:sync` builds the Vite app and copies it into the Android project. The future native USB plugin belongs in that Android project; it will be exposed to the existing web UI without duplicating the Blockly editor.

### Build a debug APK

In Android Studio, open `robocode/web/android`. Set **Gradle JDK** to a Java 21 runtime, then use **Build → Build APK(s)**. The resulting test APK is created at `android/app/build/outputs/apk/debug/app-debug.apk`.

The current Android wrapper proves that the existing Blockly app packages successfully. It does not yet access USB devices; that is the next native-plugin task.

### USB connection beta

The Android app detects supported USB serial adapters, including the CP2102 used by the Phase 0 board, and requests Android USB access only after the user taps **Allow USB access**. In the RoboCode Android app, connect the ESP32 through OTG, choose **Check ESP32**, grant permission for the listed device, then open the Serial Monitor. It defaults to 115200 baud; resetting the ESP32 should show its boot output.

### Native ESP32 flashing beta

The Hardware tab can now flash an ESP32 application binary without ArduinoDroid. Start with **Flash RoboCode Blink test**: it writes a bundled, matching bootloader, partition table, OTA selector, and GPIO 2 Blink app to the standard classic-ESP32 addresses. It prints `LED ON` and `LED OFF` at 115200 baud, so Serial Monitor verifies the result even if a board's built-in LED is wired differently. This first test expects the same classic ESP32 / CP2102 board used in Phase 0.

If the board does not automatically enter download mode, hold **BOOT**, tap **EN/RESET** once, release **BOOT**, and tap Flash again. After a successful flash, open Serial Monitor at 115200 baud to verify the program's output. **Flash app .bin** is for an ESP32 application binary compiled for the same board; it is deliberately not a generic full-device firmware installer yet.

The implementation uses Espressif's Apache-2.0 licensed `esptool-js` package inside the Android app, while the Capacitor USB bridge owns Android's CP2102 connection. A successful on-device Blink flash is the acceptance test before we add RoboCode's native sketch compilation and automatic app-binary generation.
