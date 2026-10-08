import * as Blockly from 'blockly';
import './style.css';
import { defineRoboCodeBlocks, toolbox } from './blocks.js';
import { generateArduinoCode } from './generator.js';

defineRoboCodeBlocks();

document.querySelector('#app').innerHTML = `
  <header class="app-header">
    <div>
      <p class="eyebrow">ROBOCODE · PHASE 1</p>
      <h1>Blockly to Arduino</h1>
      <p class="subtitle">Build a looping LED program, then inspect the ESP32 sketch it creates.</p>
    </div>
    <div class="status"><span></span> Generator ready</div>
  </header>
  <main class="app-main">
    <section class="workspace-panel" aria-labelledby="workspace-heading">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">1. BUILD</p>
          <h2 id="workspace-heading">Program blocks</h2>
        </div>
        <button id="load-blink" class="secondary" type="button">Load Blink example</button>
      </div>
      <div id="blockly-div" aria-label="Blockly programming workspace"></div>
      <p class="hint">Use one <strong>START</strong> block. Its contents repeat inside Arduino <code>loop()</code>.</p>
    </section>
    <section class="code-panel" aria-labelledby="code-heading">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">2. REVIEW</p>
          <h2 id="code-heading">Generated Arduino sketch</h2>
        </div>
        <button id="copy-code" type="button">Copy .ino</button>
      </div>
      <pre><code id="generated-code"></code></pre>
      <p id="copy-status" class="hint" aria-live="polite">The sketch is generated locally from your blocks.</p>
    </section>
  </main>
`;

const workspace = Blockly.inject('blockly-div', {
  toolbox,
  grid: { spacing: 20, length: 3, colour: '#dce7ed', snap: true },
  trashcan: true,
  zoom: { controls: true, wheel: true, startScale: 0.9, maxScale: 1.3, minScale: 0.6 },
  move: { scrollbars: true, drag: true, wheel: true },
  theme: Blockly.Themes.Classic,
});

const codeElement = document.querySelector('#generated-code');
const copyStatus = document.querySelector('#copy-status');

function updateGeneratedCode() {
  codeElement.textContent = generateArduinoCode(workspace);
}

function loadBlinkExample() {
  Blockly.Events.disable();
  try {
    workspace.clear();
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
    start.moveBy(48, 44);
  } finally {
    Blockly.Events.enable();
  }
  updateGeneratedCode();
}

workspace.addChangeListener((event) => {
  if (!event.isUiEvent) updateGeneratedCode();
});

document.querySelector('#load-blink').addEventListener('click', loadBlinkExample);
document.querySelector('#copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(codeElement.textContent);
    copyStatus.textContent = 'Copied. Paste this into an Arduino sketch named robocode_blink.ino.';
  } catch {
    copyStatus.textContent = 'Copy was blocked by the browser. Select the code and copy it manually.';
  }
});

new ResizeObserver(() => Blockly.svgResize(workspace)).observe(document.querySelector('#blockly-div'));
updateGeneratedCode();
