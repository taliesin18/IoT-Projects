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
