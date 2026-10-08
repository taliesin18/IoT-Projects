import * as Blockly from 'blockly';
import './style.css';
import { defineRoboCodeBlocks, toolbox } from './blocks.js';
import { generateArduinoCode } from './generator.js';
import { createProject, loadProject } from './project.js';

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
        <div class="panel-actions">
          <button id="load-blink" class="secondary" type="button">Load Blink example</button>
          <button id="save-project" class="secondary" type="button">Save project</button>
          <button id="load-project" class="secondary" type="button">Load project</button>
          <input id="project-file" type="file" accept="application/json,.json" hidden>
        </div>
      </div>
      <div id="blockly-div" aria-label="Blockly programming workspace"></div>
      <p class="hint">Use one <strong>START</strong> block. Its contents repeat inside Arduino <code>loop()</code>.</p>
      <p id="project-status" class="hint project-status" aria-live="polite">Projects are saved locally as RoboCode JSON files.</p>
    </section>
    <section class="code-panel" aria-labelledby="code-heading">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">2. REVIEW</p>
          <h2 id="code-heading">Generated Arduino sketch</h2>
        </div>
        <div class="code-actions">
          <button id="download-code" type="button">Download .ino</button>
          <button id="copy-code" class="secondary" type="button">Copy code</button>
        </div>
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
const projectStatus = document.querySelector('#project-status');
const projectFileInput = document.querySelector('#project-file');

function updateGeneratedCode() {
  codeElement.textContent = generateArduinoCode(workspace);
}

function downloadFile(contents, filename, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const download = document.createElement('a');
  download.href = url;
  download.download = filename;
  document.body.append(download);
  download.click();
  download.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
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

    for (const block of [start, ledOn, waitOn, ledOff, waitOff]) {
      block.initSvg();
    }

    ledOn.setFieldValue('ON', 'STATE');
    waitOn.setFieldValue(1000, 'MILLISECONDS');
    ledOff.setFieldValue('OFF', 'STATE');
    waitOff.setFieldValue(1000, 'MILLISECONDS');

    start.getInput('DO').connection.connect(ledOn.previousConnection);
    ledOn.nextConnection.connect(waitOn.previousConnection);
    waitOn.nextConnection.connect(ledOff.previousConnection);
    ledOff.nextConnection.connect(waitOff.previousConnection);
    start.render();
    start.moveBy(48, 44);
  } finally {
    Blockly.Events.enable();
  }
  updateGeneratedCode();
  projectStatus.textContent = 'Blink example loaded.';
}

workspace.addChangeListener((event) => {
  if (!event.isUiEvent) updateGeneratedCode();
});

document.querySelector('#load-blink').addEventListener('click', loadBlinkExample);
document.querySelector('#save-project').addEventListener('click', () => {
  const project = createProject(workspace);
  downloadFile(JSON.stringify(project, null, 2), 'robocode-project.json', 'application/json');
  projectStatus.textContent = 'Project saved as robocode-project.json.';
});

document.querySelector('#load-project').addEventListener('click', () => projectFileInput.click());
projectFileInput.addEventListener('change', async () => {
  const [file] = projectFileInput.files;
  if (!file) return;

  try {
    loadProject(workspace, JSON.parse(await file.text()));
    updateGeneratedCode();
    projectStatus.textContent = `Loaded ${file.name}.`;
  } catch (error) {
    projectStatus.textContent = `Could not load ${file.name}: ${error.message}`;
  } finally {
    projectFileInput.value = '';
  }
});

document.querySelector('#copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(codeElement.textContent);
    copyStatus.textContent = 'Copied. Paste this into an Arduino sketch named robocode_blink.ino.';
  } catch {
    copyStatus.textContent = 'Copy was blocked by the browser. Select the code and copy it manually.';
  }
});

document.querySelector('#download-code').addEventListener('click', () => {
  downloadFile(codeElement.textContent, 'robocode_blink.ino', 'text/x-arduino');
  copyStatus.textContent = 'Downloaded robocode_blink.ino. Open it in ArduinoDroid, then compile and upload.';
});

new ResizeObserver(() => Blockly.svgResize(workspace)).observe(document.querySelector('#blockly-div'));
updateGeneratedCode();
