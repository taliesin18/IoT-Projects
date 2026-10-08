import * as Blockly from 'blockly';

export const PROJECT_FORMAT = 'robocode-project';
export const PROJECT_VERSION = 1;

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
  } finally {
    Blockly.Events.enable();
  }
}
