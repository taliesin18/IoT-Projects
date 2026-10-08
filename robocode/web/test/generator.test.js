import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';
import { defineRoboCodeBlocks } from '../src/blocks.js';
import { generateArduinoCode } from '../src/generator.js';

defineRoboCodeBlocks();

test('generates the expected one-second blink sketch', () => {
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
  assert.match(code, /pinMode\(LED_BUILTIN, OUTPUT\);/);
  assert.match(code, /digitalWrite\(LED_BUILTIN, HIGH\);/);
  assert.match(code, /delay\(1000\);/);
  assert.match(code, /digitalWrite\(LED_BUILTIN, LOW\);/);
  workspace.dispose();
});
