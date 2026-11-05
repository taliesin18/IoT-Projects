const $ = id => document.getElementById(id);
const state = {project: null, conversation: null, config: null, busy: false, pending: null};
function status(text = '') { $('status').textContent = text; }
async function api(path, body) {
  const response = await fetch('/api' + path, {method: body === undefined ? 'GET' : 'POST', headers: {'Content-Type': 'application/json', 'X-WhiteSheep-Client': 'local-web'}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Please check the form fields.');
  return result;
}
function option(value, label) { const el = document.createElement('option'); el.value = value; el.textContent = label; return el; }
function updateSkills() {
  const category = $('skill-category').value;
  $('skill').replaceChildren(option('', 'No skill'), ...Object.entries(state.config.skills)
    .filter(([, skill]) => skill.category === category).map(([key, skill]) => option(key, skill.label)));
}
function updateAgents(legacyId = null) {
  $('agent').replaceChildren(...Object.entries(state.config.agents)
    .filter(([id, agent]) => agent.selectable || id === legacyId)
    .map(([id, agent]) => option(id, agent.label + (!agent.selectable ? ' (existing conversation)' : ''))));
}
function navButton(label, active, action) { const el = document.createElement('button'); el.textContent = label; el.classList.toggle('active', active); el.onclick = () => guarded(action); return el; }
async function guarded(action) { if (state.busy) return; try {status(); await action();} catch (error) {status(error.message);} }
function setBusy(busy) {state.busy = busy; document.querySelectorAll('button, select, textarea, input').forEach(el => {el.disabled = busy;}); $('send').textContent = busy ? 'Thinking locally…' : 'Send message ↗';}
async function refreshLists() {
  const [projects, conversations] = await Promise.all([api('/projects'), api('/conversations')]);
  $('projects').replaceChildren(...projects.map(p => navButton(p.name, p.id === state.project?.id, () => selectProject(p.id))));
  const visible = conversations.filter(c => c.project_id === (state.project?.id ?? null));
  $('conversations').replaceChildren(...visible.map(c => navButton(c.title, c.id === state.conversation?.id, () => openConversation(c.id))));
}
async function notebook() {
  $('project-memory').hidden = !state.project;
  $('memory-hint').hidden = !!state.project;
  $('workspace-title').textContent = state.project?.name || 'Your thinking space.';
  $('workspace-description').textContent = state.project?.description || 'Explore an idea, work through a problem, or start a project.';
  if (!state.project) return;
  state.project = await api('/projects/' + state.project.id);
  $('memories').replaceChildren(...state.project.memory.map(m => {
    const el = document.createElement('div'); el.className = 'memory-card';
    const label = document.createElement('strong'); label.textContent = m.kind;
    el.append(label, document.createTextNode(m.content)); return el;
  }));
  $('history').replaceChildren(...state.project.history.map(h => {const el = document.createElement('div'); el.className = 'history-item'; el.textContent = `${new Date(h.created_at).toLocaleString()} · ${h.action}`; return el;}));
}
function renderMessages(messages) {
  $('messages').replaceChildren(...messages.map(m => {
    const el = document.createElement('article'); el.className = 'message ' + m.role;
    const label = document.createElement('strong'); label.textContent = m.role === 'user' ? 'YOU' + (m.skill ? ' · ' + (state.config.skills[m.skill]?.label || m.skill) : '') : 'WHITESHEEP';
    el.append(label, document.createTextNode(m.content)); return el;
  }));
  $('messages').scrollTop = $('messages').scrollHeight;
}
function resetChat() {
  state.conversation = null; state.pending = null;
  updateAgents();
  $('agent').value = state.project ? state.config.default_agent : 'core';
  $('route').value = state.config.agents[$('agent').value].route;
  $('prompt').value = ''; renderMessages([]);
}
async function selectProject(id) {state.project = id ? await api('/projects/' + id) : null; resetChat(); await notebook(); await refreshLists();}
async function openConversation(id) {
  state.conversation = await api('/conversations/' + id); state.pending = null;
  updateAgents(state.conversation.agent);
  $('agent').value = state.conversation.agent; $('route').value = state.conversation.route;
  renderMessages(state.conversation.messages); await refreshLists();
}
$('general').onclick = () => guarded(() => selectProject(null));
$('new-chat').onclick = () => guarded(async () => {resetChat(); await refreshLists();});
$('agent').onchange = () => { $('route').value = state.config.agents[$('agent').value].route; if (state.conversation) status('Assistant selection applies to your next new conversation.'); };
$('route').onchange = () => {if (state.conversation) status('Model selection applies to your next new conversation.');};
$('skill-category').onchange = updateSkills;
$('project-form').onsubmit = event => {event.preventDefault(); guarded(async () => {const form = event.target; const project = await api('/projects', Object.fromEntries(new FormData(form))); form.reset(); await selectProject(project.id);});};
$('memory-form').onsubmit = event => {event.preventDefault(); guarded(async () => {await api(`/projects/${state.project.id}/memory`, Object.fromEntries(new FormData(event.target))); event.target.reset(); await notebook(); status('Saved to project memory.');});};
$('chat-form').onsubmit = async event => {
  event.preventDefault(); if (state.busy) return;
  const content = $('prompt').value.trim(); if (!content) return;
  setBusy(true); status('Qwen is thinking on your machine…');
  try {
    if (!state.conversation) state.conversation = await api('/conversations', {project_id: state.project?.id ?? null, title: content.slice(0, 100), agent: $('agent').value, route: $('route').value});
    const skill = $('skill').value || null;
    if (!state.pending || state.pending.content !== content || state.pending.skill !== skill) state.pending = {content, skill, request_id: crypto.randomUUID()};
    const result = await api(`/conversations/${state.conversation.id}/messages`, state.pending);
    $('prompt').value = ''; state.pending = null;
    await openConversation(state.conversation.id); await notebook();
    status(result.context_truncated ? 'Answered using recent context. Your full history remains saved.' : 'Saved locally.');
  } catch (error) {status(error.message + ' Your message is still in the input box.');}
  finally {setBusy(false);}
};
$('tools-toggle').onclick = () => {$('tools-panel').hidden = !$('tools-panel').hidden;};
$('tool-form').onsubmit = event => {event.preventDefault(); guarded(async () => {
  const result = await api('/tools/run', {agent: 'codelab', tool: $('tool').value, repository: $('repository').value, path: $('tool-path').value, confirmed: $('tool-confirm').checked});
  $('tool-output').textContent = result.content ?? JSON.stringify(result, null, 2); $('tool-confirm').checked = false;
});};
async function init() {
  state.config = await api('/config');
  updateAgents();
  $('route').replaceChildren(...Object.entries(state.config.models).map(([key, route]) => option(key, `${key} · ${route.model}`)));
  updateSkills();
  $('memory-kind').replaceChildren(...state.config.memory_kinds.map(k => option(k, k)));
  $('repository').replaceChildren(...(state.config.repositories.length ? state.config.repositories.map(k => option(k, k)) : [option('', 'No repositories enabled')]));
  await refreshLists();
}
init().catch(error => status(error.message));
