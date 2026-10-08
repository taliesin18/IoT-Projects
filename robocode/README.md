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
