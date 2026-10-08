import * as Blockly from 'blockly';

let blocksDefined = false;

export function defineRoboCodeBlocks() {
  if (blocksDefined) return;

  Blockly.common.defineBlocksWithJsonArray([
    {
      type: 'robocode_start',
      message0: 'START',
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      colour: 210,
      tooltip: 'Everything inside START repeats in the Arduino loop.',
      helpUrl: '',
    },
    {
      type: 'robocode_set_builtin_led',
      message0: 'set built-in LED %1',
      args0: [{
        type: 'field_dropdown',
        name: 'STATE',
        options: [['ON', 'ON'], ['OFF', 'OFF']],
      }],
      previousStatement: null,
      nextStatement: null,
      colour: 25,
      tooltip: 'Set the board\'s built-in LED on or off.',
      helpUrl: '',
    },
    {
      type: 'robocode_wait_ms',
      message0: 'wait %1 milliseconds',
      args0: [{
        type: 'field_number',
        name: 'MILLISECONDS',
        value: 1000,
        min: 0,
        max: 60000,
        precision: 1,
      }],
      previousStatement: null,
      nextStatement: null,
      colour: 120,
      tooltip: 'Pause the program for a number of milliseconds.',
      helpUrl: '',
    },
  ]);
  blocksDefined = true;
}

export const toolbox = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Program',
      colour: '#4a6fa5',
      contents: [{ kind: 'block', type: 'robocode_start' }],
    },
    {
      kind: 'category',
      name: 'LED',
      colour: '#d97706',
      contents: [{ kind: 'block', type: 'robocode_set_builtin_led' }],
    },
    {
      kind: 'category',
      name: 'Timing',
      colour: '#2f855a',
      contents: [{ kind: 'block', type: 'robocode_wait_ms' }],
    },
  ],
};
