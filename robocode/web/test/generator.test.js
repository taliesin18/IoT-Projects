import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as Blockly from 'blockly';
import { defineRoboCodeBlocks } from '../src/blocks.js';
import { generateArduinoCode } from '../src/generator.js';

defineRoboCodeBlocks();

test('starts with an empty Arduino sketch', () => {
  const workspace = new Blockly.Workspace();
  const code = generateArduinoCode(workspace);

  assert.match(code, /void setup\(\) \{\n\}/);
  assert.match(code, /void loop\(\) \{\n\}/);
  assert.doesNotMatch(code, /ROBOCODE_BUILT_IN_LED_PIN/);
  assert.doesNotMatch(code, /delay\(/);
  workspace.dispose();
});

test('generates the expected one-second blink sketch', async () => {
  const workspace = new Blockly.Workspace();
  const start = workspace.newBlock('robocode_start');
  const ledOn = workspace.newBlock('robocode_set_builtin_led');
  const waitOn = workspace.newBlock('robocode_wait_ms');
  const ledOff = workspace.newBlock('robocode_set_builtin_led');
  const waitOff = workspace.newBlock('robocode_wait_ms');

  ledOn.setFieldValue('ON', 'STATE');
  waitOn.setFieldValue(1000, 'MILLISECONDS');
  ledOff.setFieldValue('OFF', 'STATE');
  waitOff.setFieldValue(1000, 'MILLISECONDS');
  start.getInput('DO').connection.connect(ledOn.previousConnection);
  ledOn.nextConnection.connect(waitOn.previousConnection);
  waitOn.nextConnection.connect(ledOff.previousConnection);
  ledOff.nextConnection.connect(waitOff.previousConnection);

  const code = generateArduinoCode(workspace);
  assert.match(code, /pinMode\(ROBOCODE_BUILT_IN_LED_PIN, OUTPUT\);/);
  assert.match(code, /digitalWrite\(ROBOCODE_BUILT_IN_LED_PIN, HIGH\);/);
  assert.match(code, /delay\(1000\);/);
  assert.match(code, /digitalWrite\(ROBOCODE_BUILT_IN_LED_PIN, LOW\);/);
  const fixture = await readFile(
    new URL('../../fixtures/blink-1000ms/blink-1000ms.ino', import.meta.url),
    'utf8',
  );
  assert.equal(code.trim(), fixture.trim());
  workspace.dispose();
});
