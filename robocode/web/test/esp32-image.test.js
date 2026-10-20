import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { esp32ImageFromElf } from '../src/esp32-image.js';

test('rejects an invalid or truncated ELF before producing flash data', async () => {
  await assert.rejects(esp32ImageFromElf(new Uint8Array(12)), /Truncated/);
  await assert.rejects(esp32ImageFromElf(new Uint8Array(52)), /Xtensa/);
});

test('matches official esptool output byte for byte for the reference build', { skip: !process.env.ROBOCODE_REFERENCE_ELF }, async () => {
  const elf = await readFile(process.env.ROBOCODE_REFERENCE_ELF);
  const expected = await readFile(process.env.ROBOCODE_REFERENCE_ELF.replace(/\.elf$/, '.bin'));
  assert.deepEqual(Buffer.from(await esp32ImageFromElf(elf)), expected);
});
