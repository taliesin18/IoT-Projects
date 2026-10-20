import * as Blockly from 'blockly';

export const PROJECT_FORMAT = 'robocode-project';
export const PROJECT_VERSION = 1;

export function ensureStartBlock(workspace, { x = 48, y = 44 } = {}) {
  const starts = workspace.getTopBlocks(true).filter((block) => block.type === 'robocode_start');
  const start = starts[0] || workspace.newBlock('robocode_start');
  // START is deliberately not in the toolbox. If an old or hand-edited project
  // contains more than one, keep its first entry point and remove the extras.
  starts.slice(1).forEach((extraStart) => extraStart.dispose(false));
  if (starts.length === 0) {
    start.initSvg?.();
    start.render?.();
    start.moveBy(x, y);
  }
  // RoboCode keeps one clear entry point. Students can empty its contents,
  // while New project remains the intentional way to begin again.
  start.setDeletable(false);
  return start;
}

export function createProject(workspace) {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    workspace: Blockly.serialization.workspaces.save(workspace),
  };
}

export function loadProject(workspace, project) {
  if (!project || typeof project !== 'object') {
    throw new Error('The selected file is not a RoboCode project.');
  }
  if (project.format !== PROJECT_FORMAT || project.version !== PROJECT_VERSION) {
    throw new Error('This project format or version is not supported.');
  }
  if (!project.workspace || typeof project.workspace !== 'object') {
    throw new Error('The project does not contain a Blockly workspace.');
  }

  Blockly.Events.disable();
  try {
    workspace.clear();
    Blockly.serialization.workspaces.load(project.workspace, workspace);
    ensureStartBlock(workspace);
  } finally {
    Blockly.Events.enable();
  }
}
