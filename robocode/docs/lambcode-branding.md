# LambCode · WhiteSheep AI

LambCode is the ESP32 block-programming app in the WhiteSheep AI ecosystem.
**Small device. Big ideas.** The Project → Build → Hardware workflow remains the
same, including Arduino code generation, phone compilation, OTG flashing,
serial monitoring, and the optional local PC compiler.

## Visual identity

| Color | Value | Use |
| --- | --- | --- |
| Deep petrol blue | `#123E48` | Header, active navigation, icon background |
| Teal | `#217A78` | Controls, focus outlines, lamb face |
| Ivory | `#F7F3E8` | App canvas, wool, light text |
| Amber | `#E9B44C` | Compile & Flash action and small highlights |

The lamb mark has code-bracket eyes. It is newly recreated source artwork for
this rebrand: no generated image attachment was available from the referenced
conversation. It is integrated in the web header/favicon, Android launcher
(legacy and adaptive), and launch theme. Regenerate the SVG and Android vector
resources with `node tools/generate-brand-assets.mjs` from `robocode/`.
The app uses system fonts and bundled artwork; branding adds no network request.
Blockly category colors remain distinct to help learners recognize block types.

## Compatibility decisions

- The repository folder stays `robocode/` so existing commands and links work.
- Android keeps `com.taliesin.robocode`, Java package names, native plugin names,
  and the custom URL scheme. A build signed with the same signing key can update
  the existing app rather than install a separate app. Release signing and
  version increments remain part of the release process.
- Saved files now download as `lambcode-project.json`, but their format remains
  `robocode-project`, version 1, with the original `robocode_*` block types.
  Existing RoboCode files load without migration; LambCode exports retain the
  same schema for older app versions that support their block types.
- Compiler settings retain their existing local-storage key. Compiler environment
  variables, cache paths, internal build filenames, and generated helper names
  also remain unchanged.
- Exported sketches use `lambcode_program.ino`. The generator changes only its
  attribution comment; new serial/LCD blocks use LambCode example text. Text in
  existing saved projects is preserved.
- The bundled Blink firmware and its matching source are unchanged. The UI calls
  it the LambCode Blink test, but its serial startup banner still says
  `RoboCode native flash test started.` Historical research and test notes retain
  their original product name and are not new validation claims.

WhiteSheep AI describes the product family. This rebrand does not add an AI
assistant, Flock device management, cloud services, lessons, or paid tiers.

## Verification and release checklist

Run `npm ci`, `npm test`, and `npm run android:sync` from `robocode/web`.
With the existing compiler bundle prepared (see [tooling](../tools/README.md)),
run `gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:lintDebug`
from `web/android` using Java 21 and the Android SDK.

Before a release, install an APK signed with the existing app's key on a test
phone. Confirm the launcher name/icon, open an existing RoboCode JSON project,
check the saved compiler connection, compile it, flash a classic ESP32/CP2102
over OTG, and verify serial output. Check portrait and landscape layouts and
the Android launch screen. A successful build is not a physical USB acceptance
test. Keep the bundled firmware and native compiler binaries out of source
control as documented by the existing build workflow.
