// Editable LambCode mark: one set of paths for web and Android vector assets.
// Run with `node tools/generate-brand-assets.mjs` from robocode.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const petrol = '#123E48';
const ivory = '#F7F3E8';
const teal = '#217A78';
const amber = '#E9B44C';
const shapes = [
  // Wool, two ears, face, code-bracket eyes, and a small amber nose.
  [ivory, 'M34 51 C24 48 27 35 37 35 C38 24 51 23 56 31 C64 25 75 30 74 39 C86 41 83 54 75 56 L34 56 Z'],
  [teal, 'M39 53 C31 45 24 48 28 57 C30 62 36 63 41 61 Z M69 53 C77 45 84 48 80 57 C78 62 72 63 67 61 Z'],
  [teal, 'M39 49 Q54 43 69 49 L68 64 Q66 79 54 80 Q42 79 40 64 Z'],
  [ivory, 'M48 53 L42 59 L48 65 L51 62 L48 59 L51 56 Z M60 53 L66 59 L60 65 L57 62 L60 59 L57 56 Z'],
  [amber, 'M50 69 L58 69 L54 74 Z'],
];
const root = new URL('../', import.meta.url);
async function output(path, content) {
  const url = new URL(path, root);
  await mkdir(fileURLToPath(new URL('.', url)), { recursive: true });
  await writeFile(url, content + '\n');
}
const paths = shapes.map(([fill, d]) => `  <path fill="${fill}" d="${d}"/>`).join('\n');
await output('web/public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" fill="none">
  <title>LambCode</title>
  <rect width="108" height="108" rx="24" fill="${petrol}"/>
${paths}
</svg>`);
const colorRefs = { [petrol]: 'petrol', [ivory]: 'ivory', [teal]: 'teal', [amber]: 'amber' };
const vectorPaths = shapes.map(([fill, d]) => `    <path android:fillColor="@color/lambcode_${colorRefs[fill]}" android:pathData="${d}"/>`).join('\n');
const res = 'web/android/app/src/main/res/';
const vector = (body) => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
${body}
</vector>`;
await output(res + 'drawable/ic_lambcode_foreground.xml', vector(vectorPaths));
await output(res + 'mipmap-anydpi/ic_lambcode.xml', vector(`    <path android:fillColor="@color/lambcode_petrol" android:pathData="M0 0 H108 V108 H0 Z"/>
${vectorPaths}`));
await output(res + 'mipmap-anydpi-v26/ic_lambcode.xml', `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/lambcode_petrol"/>
    <foreground android:drawable="@drawable/ic_lambcode_foreground"/>
</adaptive-icon>`);
await output(res + 'values/lambcode_colors.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="lambcode_petrol">${petrol}</color>
    <color name="lambcode_teal">${teal}</color>
    <color name="lambcode_ivory">${ivory}</color>
    <color name="lambcode_amber">${amber}</color>
</resources>`);
