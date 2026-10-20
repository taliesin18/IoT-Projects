import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';
import { defineRoboCodeBlocks } from '../src/blocks.js';
import { generateArduinoCode } from '../src/generator.js';
import { createProject, ensureStartBlock, loadProject } from '../src/project.js';

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

test('generates the expected GPIO output sketch', () => {
  const workspace = new Blockly.Workspace();
  const start = workspace.newBlock('robocode_start');
  const outputOn = workspace.newBlock('robocode_set_gpio_output');
  const waitOn = workspace.newBlock('robocode_wait_ms');
  const outputOff = workspace.newBlock('robocode_set_gpio_output');
  const waitOff = workspace.newBlock('robocode_wait_ms');

  outputOn.setFieldValue('27', 'PIN');
  outputOn.setFieldValue('HIGH', 'STATE');
  waitOn.setFieldValue(1000, 'MILLISECONDS');
  outputOff.setFieldValue('27', 'PIN');
  outputOff.setFieldValue('LOW', 'STATE');
  waitOff.setFieldValue(1000, 'MILLISECONDS');
  start.getInput('DO').connection.connect(outputOn.previousConnection);
  outputOn.nextConnection.connect(waitOn.previousConnection);
  waitOn.nextConnection.connect(outputOff.previousConnection);
  outputOff.nextConnection.connect(waitOff.previousConnection);

  const code = generateArduinoCode(workspace);
  assert.match(code, /pinMode\(27, OUTPUT\);/);
  assert.match(code, /digitalWrite\(27, HIGH\);/);
  assert.match(code, /delay\(1000\);/);
  assert.match(code, /digitalWrite\(27, LOW\);/);
  workspace.dispose();
});

test('round-trips a Blockly project without changing its Arduino sketch', () => {
  const source = new Blockly.Workspace();
  const start = source.newBlock('robocode_start');
  const output = source.newBlock('robocode_set_gpio_output');
  output.setFieldValue('27', 'PIN');
  output.setFieldValue('LOW', 'STATE');
  start.getInput('DO').connection.connect(output.previousConnection);

  const project = createProject(source);
  const restored = new Blockly.Workspace();
  loadProject(restored, project);

  assert.equal(generateArduinoCode(restored), generateArduinoCode(source));
  source.dispose();
  restored.dispose();
});

test('keeps one undeletable START block for a new or loaded project', () => {
  const workspace = new Blockly.Workspace();
  const firstStart = ensureStartBlock(workspace);
  const repeatedStart = ensureStartBlock(workspace);

  assert.equal(firstStart.id, repeatedStart.id);
  assert.equal(workspace.getTopBlocks(true).filter((block) => block.type === 'robocode_start').length, 1);
  assert.equal(firstStart.isDeletable(), false);

  const emptySource = new Blockly.Workspace();
  loadProject(workspace, createProject(emptySource));
  const restoredStarts = workspace.getTopBlocks(true).filter((block) => block.type === 'robocode_start');
  assert.equal(restoredStarts.length, 1);
  assert.equal(restoredStarts[0].isDeletable(), false);

  emptySource.dispose();
  workspace.dispose();
});

test('generates setup and output instructions for safe external GPIO pins', () => {
  const workspace = new Blockly.Workspace();
  const start = workspace.newBlock('robocode_start');
  const outputOn = workspace.newBlock('robocode_set_gpio_output');
  const outputOff = workspace.newBlock('robocode_set_gpio_output');
  outputOn.setFieldValue('16', 'PIN');
  outputOn.setFieldValue('HIGH', 'STATE');
  outputOff.setFieldValue('23', 'PIN');
  outputOff.setFieldValue('LOW', 'STATE');
  start.getInput('DO').connection.connect(outputOn.previousConnection);
  outputOn.nextConnection.connect(outputOff.previousConnection);

  const code = generateArduinoCode(workspace);
  assert.match(code, /pinMode\(16, OUTPUT\);/);
  assert.match(code, /pinMode\(23, OUTPUT\);/);
  assert.match(code, /digitalWrite\(16, HIGH\);/);
  assert.match(code, /digitalWrite\(23, LOW\);/);
  workspace.dispose();
});

test('generates a reusable button condition inside a general if block', () => {
  const workspace = new Blockly.Workspace();
  const start = workspace.newBlock('robocode_start');
  const ifBlock = workspace.newBlock('robocode_if');
  const button = workspace.newBlock('robocode_button_pressed');
  const outputOn = workspace.newBlock('robocode_set_gpio_output');
  const outputOff = workspace.newBlock('robocode_set_gpio_output');

  button.setFieldValue('27', 'PIN');
  outputOn.setFieldValue('16', 'PIN');
  outputOn.setFieldValue('HIGH', 'STATE');
  outputOff.setFieldValue('16', 'PIN');
  outputOff.setFieldValue('LOW', 'STATE');
  start.getInput('DO').connection.connect(ifBlock.previousConnection);
  ifBlock.getInput('CONDITION').connection.connect(button.outputConnection);
  ifBlock.getInput('DO').connection.connect(outputOn.previousConnection);
  ifBlock.getInput('ELSE').connection.connect(outputOff.previousConnection);

  const code = generateArduinoCode(workspace);
  assert.match(code, /pinMode\(27, INPUT_PULLUP\);/);
  assert.match(code, /pinMode\(16, OUTPUT\);/);
  assert.match(code, /if \(digitalRead\(27\) == LOW\) \{\n    digitalWrite\(16, HIGH\);\n  \} else \{\n    digitalWrite\(16, LOW\);/);
  workspace.dispose();
});

test('generates repeat and serial-print blocks without assuming a built-in LED', () => {
  const workspace = new Blockly.Workspace();
  const start = workspace.newBlock('robocode_start');
  const repeat = workspace.newBlock('robocode_repeat');
  const count = workspace.newBlock('robocode_number');
  const print = workspace.newBlock('robocode_serial_print');

  count.setFieldValue(3, 'VALUE');
  print.setFieldValue('Ready "now"', 'TEXT');
  start.getInput('DO').connection.connect(repeat.previousConnection);
  repeat.getInput('COUNT').connection.connect(count.outputConnection);
  repeat.getInput('DO').connection.connect(print.previousConnection);

  const code = generateArduinoCode(workspace);
  assert.match(code, /Serial\.begin\(115200\);/);
  assert.match(code, /for \(int robocodeRepeat = 0, robocodeRepeatLimit = 3; robocodeRepeat < robocodeRepeatLimit; \+\+robocodeRepeat\) \{/);
  assert.match(code, /Serial\.println\("Ready \\"now\\""\);/);
  assert.doesNotMatch(code, /ROBOCODE_BUILT_IN_LED_PIN/);
  workspace.dispose();
});

test('generates project-local variables for repeats and serial values', () => {
  const workspace = new Blockly.Workspace();
  const counter = workspace.getVariableMap().createVariable('counter');
  const start = workspace.newBlock('robocode_start');
  const setCounter = workspace.newBlock('robocode_variable_set');
  const initialValue = workspace.newBlock('robocode_number');
  const repeat = workspace.newBlock('robocode_repeat');
  const counterValue = workspace.newBlock('robocode_variable_get');
  const printCounter = workspace.newBlock('robocode_serial_print_value');
  const printedValue = workspace.newBlock('robocode_variable_get');
  const changeCounter = workspace.newBlock('robocode_variable_change');
  const changeValue = workspace.newBlock('robocode_number');

  for (const block of [setCounter, counterValue, printedValue, changeCounter]) {
    block.setFieldValue(counter.getId(), 'VAR');
  }
  initialValue.setFieldValue(3, 'VALUE');
  changeValue.setFieldValue(1, 'VALUE');
  start.getInput('DO').connection.connect(setCounter.previousConnection);
  setCounter.getInput('VALUE').connection.connect(initialValue.outputConnection);
  setCounter.nextConnection.connect(repeat.previousConnection);
  repeat.getInput('COUNT').connection.connect(counterValue.outputConnection);
  repeat.getInput('DO').connection.connect(printCounter.previousConnection);
  printCounter.getInput('VALUE').connection.connect(printedValue.outputConnection);
  printCounter.nextConnection.connect(changeCounter.previousConnection);
  changeCounter.getInput('VALUE').connection.connect(changeValue.outputConnection);

  const code = generateArduinoCode(workspace);
  assert.match(code, /int robocode_counter = 0;/);
  assert.match(code, /robocode_counter = 3;/);
  assert.match(code, /robocodeRepeatLimit = robocode_counter/);
  assert.match(code, /Serial\.println\(robocode_counter\);/);
  assert.match(code, /robocode_counter \+= 1;/);
  workspace.dispose();
});

test('configures GPIO outputs used inside a condition', () => {
  const workspace = new Blockly.Workspace();
  const start = workspace.newBlock('robocode_start');
  const ifBlock = workspace.newBlock('robocode_if');
  const button = workspace.newBlock('robocode_button_pressed');
  const output = workspace.newBlock('robocode_set_gpio_output');

  button.setFieldValue('27', 'PIN');
  output.setFieldValue('16', 'PIN');
  output.setFieldValue('HIGH', 'STATE');
  start.getInput('DO').connection.connect(ifBlock.previousConnection);
  ifBlock.getInput('CONDITION').connection.connect(button.outputConnection);
  ifBlock.getInput('DO').connection.connect(output.previousConnection);

  const code = generateArduinoCode(workspace);
  assert.match(code, /pinMode\(16, OUTPUT\);/);
  assert.match(code, /pinMode\(27, INPUT_PULLUP\);/);
  assert.match(code, /if \(digitalRead\(27\) == LOW\) \{\n    digitalWrite\(16, HIGH\);/);
  workspace.dispose();
});

test('measures a single-wire ultrasonic sensor and compares its distance', () => {
  const workspace = new Blockly.Workspace();
  const distance = workspace.getVariableMap().createVariable('distance');
  const start = workspace.newBlock('robocode_start');
  const measure = workspace.newBlock('robocode_measure_ultrasonic');
  const ifBlock = workspace.newBlock('robocode_if');
  const comparison = workspace.newBlock('robocode_compare_numbers');
  const measuredDistance = workspace.newBlock('robocode_variable_get');
  const limit = workspace.newBlock('robocode_number');
  const output = workspace.newBlock('robocode_set_gpio_output');

  measure.setFieldValue('26', 'PIN');
  measure.setFieldValue(distance.getId(), 'VAR');
  measuredDistance.setFieldValue(distance.getId(), 'VAR');
  limit.setFieldValue(10, 'VALUE');
  comparison.setFieldValue('LT', 'OPERATOR');
  output.setFieldValue('27', 'PIN');
  output.setFieldValue('HIGH', 'STATE');
  start.getInput('DO').connection.connect(measure.previousConnection);
  measure.nextConnection.connect(ifBlock.previousConnection);
  ifBlock.getInput('CONDITION').connection.connect(comparison.outputConnection);
  comparison.getInput('LEFT').connection.connect(measuredDistance.outputConnection);
  comparison.getInput('RIGHT').connection.connect(limit.outputConnection);
  ifBlock.getInput('DO').connection.connect(output.previousConnection);

  const code = generateArduinoCode(workspace);
  assert.match(code, /int robocode_distance = 0;/);
  assert.match(code, /int robocodeReadUltrasonicCm\(uint8_t signalPin\)/);
  assert.match(code, /pinMode\(signalPin, OUTPUT\);/);
  assert.match(code, /pinMode\(signalPin, INPUT\);/);
  assert.match(code, /pulseIn\(signalPin, HIGH, 30000UL\);/);
  assert.match(code, /robocode_distance = robocodeReadUltrasonicCm\(26\);/);
  assert.match(code, /if \(robocode_distance < 10\) \{/);
  assert.match(code, /pinMode\(27, OUTPUT\);/);
  workspace.dispose();
});

test('generates PCF8574 LCD rows with 16-character text and a local value', () => {
  const workspace = new Blockly.Workspace();
  const distance = workspace.getVariableMap().createVariable('distance');
  const start = workspace.newBlock('robocode_start');
  const lcd = workspace.newBlock('robocode_lcd_rows');
  const row1 = workspace.newBlock('robocode_text');
  const row2 = workspace.newBlock('robocode_text_value');
  const distanceValue = workspace.newBlock('robocode_variable_get');
  const servo = workspace.newBlock('robocode_servo_write');
  const angle = workspace.newBlock('robocode_number');

  row1.setFieldValue('Ultrasonic', 'TEXT');
  row2.setFieldValue('Distance: ', 'PREFIX');
  row2.setFieldValue(' cm', 'SUFFIX');
  distanceValue.setFieldValue(distance.getId(), 'VAR');
  servo.setFieldValue('16', 'PIN');
  angle.setFieldValue(90, 'VALUE');
  start.getInput('DO').connection.connect(lcd.previousConnection);
  lcd.getInput('ROW1').connection.connect(row1.outputConnection);
  lcd.getInput('ROW2').connection.connect(row2.outputConnection);
  row2.getInput('VALUE').connection.connect(distanceValue.outputConnection);
  lcd.nextConnection.connect(servo.previousConnection);
  servo.getInput('ANGLE').connection.connect(angle.outputConnection);

  const code = generateArduinoCode(workspace);
  assert.match(code, /#include <Wire.h>/);
  assert.match(code, /#include <hd44780.h>/);
  assert.match(code, /#include <hd44780ioClass\/hd44780_I2Cexp.h>/);
  assert.match(code, /hd44780_I2Cexp robocodeLcd;/);
  assert.match(code, /Wire\.begin\(21, 22\);/);
  assert.match(code, /robocodeLcd\.begin\(16, 2\);/);
  assert.match(code, /void robocodeLcdWriteLine\(uint8_t row, const String& text\)/);
  assert.match(code, /index < text\.length\(\) \? text\[index\] : ' '/);
  assert.match(code, /robocodeLcdWriteRows\(String\("Ultrasonic"\), String\("Distance: "\) \+ String\(robocode_distance\) \+ String\(" cm"\)\);/);
  assert.match(code, /void robocodeServoAttach\(uint8_t pin\)/);
  assert.match(code, /robocodeServoAttach\(16\);/);
  assert.match(code, /robocodeServoWrite\(16, 90\);/);
  assert.doesNotMatch(code, /LiquidCrystal_I2C|robocodeLcdWrite4|robocodeLcdInit/);
  workspace.dispose();
});

test('clears the detected PCF8574 LCD without requiring a manual address', () => {
  const workspace = new Blockly.Workspace();
  const start = workspace.newBlock('robocode_start');
  const clear = workspace.newBlock('robocode_lcd_clear');

  start.getInput('DO').connection.connect(clear.previousConnection);

  const code = generateArduinoCode(workspace);
  assert.match(code, /#include <hd44780.h>/);
  assert.match(code, /robocodeLcd\.clear\(\);/);
  assert.doesNotMatch(code, /0x27|0x3E/);
  workspace.dispose();
});

test('scans I2C devices once and prints detected addresses to Serial Monitor', () => {
  const workspace = new Blockly.Workspace();
  const start = workspace.newBlock('robocode_start');
  const scan = workspace.newBlock('robocode_i2c_scan');
  start.getInput('DO').connection.connect(scan.previousConnection);

  const code = generateArduinoCode(workspace);
  assert.match(code, /#include <Wire.h>/);
  assert.match(code, /Wire\.begin\(21, 22\);/);
  assert.match(code, /Serial\.begin\(115200\);/);
  assert.match(code, /void robocodeScanI2cOnce\(\)/);
  assert.match(code, /static bool alreadyScanned = false;/);
  assert.match(code, /Serial\.print\("I2C device: 0x"/);
  assert.match(code, /robocodeScanI2cOnce\(\);/);
  workspace.dispose();
});

test('reads analog and light-sensor values through the two safe ADC pins', () => {
  const workspace = new Blockly.Workspace();
  const brightness = workspace.getVariableMap().createVariable('brightness');
  const waterLevel = workspace.getVariableMap().createVariable('water level');
  const start = workspace.newBlock('robocode_start');
  const light = workspace.newBlock('robocode_read_light_sensor');
  const analog = workspace.newBlock('robocode_read_analog');

  light.setFieldValue('32', 'PIN');
  light.setFieldValue(brightness.getId(), 'VAR');
  analog.setFieldValue('33', 'PIN');
  analog.setFieldValue(waterLevel.getId(), 'VAR');
  start.getInput('DO').connection.connect(light.previousConnection);
  light.nextConnection.connect(analog.previousConnection);

  const code = generateArduinoCode(workspace);
  assert.match(code, /int robocode_brightness = 0;/);
  assert.match(code, /int robocode_water_level = 0;/);
  assert.match(code, /analogReadResolution\(12\);/);
  assert.match(code, /robocode_brightness = analogRead\(32\);/);
  assert.match(code, /robocode_water_level = analogRead\(33\);/);
  workspace.dispose();
});

test('combines child-friendly AND, OR, and NOT condition blocks', () => {
  const workspace = new Blockly.Workspace();
  const start = workspace.newBlock('robocode_start');
  const ifBlock = workspace.newBlock('robocode_if');
  const both = workspace.newBlock('robocode_logic_and');
  const firstButton = workspace.newBlock('robocode_button_pressed');
  const not = workspace.newBlock('robocode_logic_not');
  const secondButton = workspace.newBlock('robocode_button_pressed');
  const output = workspace.newBlock('robocode_set_gpio_output');

  firstButton.setFieldValue('25', 'PIN');
  secondButton.setFieldValue('26', 'PIN');
  output.setFieldValue('27', 'PIN');
  output.setFieldValue('HIGH', 'STATE');
  start.getInput('DO').connection.connect(ifBlock.previousConnection);
  ifBlock.getInput('CONDITION').connection.connect(both.outputConnection);
  both.getInput('LEFT').connection.connect(firstButton.outputConnection);
  both.getInput('RIGHT').connection.connect(not.outputConnection);
  not.getInput('CONDITION').connection.connect(secondButton.outputConnection);
  ifBlock.getInput('DO').connection.connect(output.previousConnection);

  const code = generateArduinoCode(workspace);
  assert.match(code, /if \(\(digitalRead\(25\) == LOW\) && \(!\(digitalRead\(26\) == LOW\)\)\) \{/);
  assert.match(code, /pinMode\(25, INPUT_PULLUP\);/);
  assert.match(code, /pinMode\(26, INPUT_PULLUP\);/);
  workspace.dispose();
});

test('generates reusable steps with forward declarations and skips recursion', () => {
  const workspace = new Blockly.Workspace();
  const start = workspace.newBlock('robocode_start');
  const step = workspace.newBlock('robocode_step_define');
  const runStep = workspace.newBlock('robocode_step_call');
  const recursiveCall = workspace.newBlock('robocode_step_call');
  const output = workspace.newBlock('robocode_set_gpio_output');

  step.setFieldValue('blink light', 'NAME');
  runStep.setFieldValue(step.id, 'STEP');
  recursiveCall.setFieldValue(step.id, 'STEP');
  output.setFieldValue('27', 'PIN');
  output.setFieldValue('HIGH', 'STATE');
  start.getInput('DO').connection.connect(runStep.previousConnection);
  step.getInput('DO').connection.connect(output.previousConnection);
  output.nextConnection.connect(recursiveCall.previousConnection);

  const code = generateArduinoCode(workspace);
  assert.match(code, /void robocodeStep_blink_light\(\);/);
  assert.match(code, /void robocodeStep_blink_light\(\) \{\n  digitalWrite\(27, HIGH\);\n\}/);
  assert.match(code, /void loop\(\) \{\n  robocodeStep_blink_light\(\);\n\}/);
  assert.doesNotMatch(code, /digitalWrite\(27, HIGH\);\n  robocodeStep_blink_light\(\);/);
  workspace.dispose();
});
