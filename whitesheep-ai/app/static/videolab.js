const $ = id => document.getElementById(id);
let selected = null;
let timer = null;
let assetTimer = null;
let assetCache = [];
let showRecentAssets = false;
let review = null;
let reviewToken = 0;
let generating = false;
async function api(path, body) {
  const response = await fetch('/api/videos' + path, {method: body === undefined ? 'GET' : 'POST', headers: {'Content-Type':'application/json','X-WhiteSheep-Client':'local-web'}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Please check the project settings.');
  return data;
}
function showError(error) { $('video-status').textContent = error.message; }
function setTagOptions(id, tags) {
  const previous = $(id).value;
  $(id).replaceChildren(new Option('All tags', ''), ...tags.map(tag => new Option(tag, tag)));
  if (tags.includes(previous)) $(id).value = previous;
}
function renderAssets() {
  const assets = assetCache;
  const selectedAsset = $('video-asset').value;
  const tags = [...new Set(assets.flatMap(asset => asset.tags || []))].sort();
  setTagOptions('video-asset-tag', tags);
  const videoTag = $('video-asset-tag').value;
  const options = [new Option('No visual', ''), ...assets.filter(a => a.status.state === 'complete' && (!videoTag || (a.tags || []).includes(videoTag))).map(a => new Option(a.name, a.id))];
  $('video-asset').replaceChildren(...options);
  if (options.some(option => option.value === selectedAsset)) $('video-asset').value = selectedAsset;
  const query = $('asset-search').value.trim().toLowerCase();
  const matching = query ? assets.filter(asset => `${asset.name} ${(asset.tags || []).join(' ')}`.toLowerCase().includes(query)) : [];
  const base = query ? matching : showRecentAssets ? [...assets].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 5) : [];
  const applicableTags = [...new Set(base.flatMap(asset => asset.tags || []))].sort();
  setTagOptions('asset-filter', applicableTags);
  $('asset-filter').disabled = !base.length;
  $('asset-recent').setAttribute('aria-pressed', String(showRecentAssets));
  const filter = $('asset-filter').value;
  const visible = base.filter(asset => !filter || (asset.tags || []).includes(filter));
  $('asset-results-message').textContent = !query && !showRecentAssets ? 'Search by name or tag, or show the five most recent assets.' : visible.length ? `${visible.length} asset${visible.length === 1 ? '' : 's'} shown.` : 'No matching assets.';
  $('asset-list').replaceChildren(...visible.map(asset => {
    const item = document.createElement('article'); item.className = 'asset-item';
    if (asset.status.state === 'complete') {
      const img = document.createElement('img'); img.src = `/api/videos/assets/${asset.id}/image`; img.alt = asset.name; item.append(img);
    }
    const name = document.createElement('strong'); name.textContent = asset.name; item.append(name);
    if (['generated', 'diffusion'].includes(asset.kind) && asset.prompt) {
      const prompt = document.createElement('div'); prompt.className = 'asset-prompt'; prompt.textContent = `Prompt: ${asset.prompt}`; item.append(prompt);
    }
    if (asset.kind === 'diffusion') {
      const seed = document.createElement('div'); seed.className = 'asset-prompt'; seed.textContent = `Seed: ${asset.seed}`; item.append(seed);
    }
    const state = document.createElement('div'); state.textContent = asset.status.message || asset.status.state; item.append(state);
    if (asset.kind === 'generated' && asset.status.state === 'complete') {
      const caution = document.createElement('div'); caution.className = 'asset-prompt'; caution.textContent = 'Technical checks only; visual match has not been verified.'; item.append(caution);
    }
    const tags = document.createElement('div'); tags.className = 'asset-tags'; tags.textContent = (asset.tags || []).join(' · ') || 'No tags'; item.append(tags);
    const form = document.createElement('form');
    const label = document.createElement('label'); label.textContent = 'Edit tags';
    const input = document.createElement('input'); input.value = (asset.tags || []).join(', '); input.maxLength = 300; label.append(input);
    const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save tags'; form.append(label, save);
    form.onsubmit = async event => {event.preventDefault(); save.disabled = true; try {await api(`/assets/${asset.id}/tags`, {tags: parseTags(input.value)}); document.activeElement?.blur(); await refreshAssets(); $('video-status').textContent = 'Asset tags saved.';} catch (error) {showError(error);} finally {save.disabled = false;}};
    item.append(form);
    if (asset.status.state === 'complete') {
      if (asset.kind === 'diffusion') {
        const image = document.createElement('a'); image.href = `/api/videos/assets/${asset.id}/image`; image.download = `${asset.name}.png`; image.textContent = 'Download image'; item.append(image);
      } else {
        const scene = document.createElement('a'); scene.href = `/api/videos/assets/${asset.id}/blend`; scene.textContent = 'Download Blender scene'; item.append(scene);
      }
      if (asset.kind === 'generated') {
        const inspectQuality = document.createElement('button'); inspectQuality.type = 'button'; inspectQuality.textContent = 'Quality checks';
        const report = document.createElement('pre'); report.hidden = true;
        inspectQuality.onclick = async () => {try {report.textContent = JSON.stringify(await api(`/assets/${asset.id}/quality`), null, 2); report.hidden = false;} catch (error) {showError(error);}};
        item.append(inspectQuality, report);
      }
    }
    if (['complete', 'failed', 'awaiting_review'].includes(asset.status.state)) {
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete asset';
      remove.onclick = async () => {
        if (!window.confirm(`Delete “${asset.name}” and its saved files? This cannot be undone.`)) return;
        remove.disabled = true;
        try {
          const response = await fetch(`/api/videos/assets/${asset.id}`, {method:'DELETE', headers:{'X-WhiteSheep-Client':'local-web'}});
          const data = await response.json();
          if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not delete the asset.');
          if (review?.id === asset.id) { review = null; reviewToken++; $('generated-review').hidden = true; }
          $('video-status').textContent = 'Asset deleted.';
          remove.blur();
          await refreshAssets();
        } catch (error) { showError(error); remove.disabled = false; }
      };
      item.append(remove);
    }
    if (asset.kind === 'generated' && asset.status.state === 'awaiting_review') {
      const inspect = document.createElement('button'); inspect.type = 'button'; inspect.textContent = 'Review code';
      inspect.onclick = async () => { if (generating) { $('video-status').textContent = 'Wait until the new draft finishes.'; return; } try {await reviewGenerated(asset.id);} catch (error) {showError(error);} }; item.append(inspect);
    }
    return item;
  }));
}
function parseTags(value) { return value.split(',').map(tag => tag.trim()).filter(Boolean); }
async function refreshAssets() {
  clearTimeout(assetTimer);
  assetCache = await api('/assets');
  if (!$('asset-list').contains(document.activeElement)) renderAssets();
  if (assetCache.some(a => ['queued','approved','running'].includes(a.status.state))) assetTimer = setTimeout(() => refreshAssets().catch(showError), 3000);
}
$('asset-search').oninput = () => {showRecentAssets = false; renderAssets();};
$('asset-filter').onchange = renderAssets;
$('asset-recent').onclick = () => {showRecentAssets = !showRecentAssets; $('asset-search').value = ''; $('asset-filter').value = ''; renderAssets();};
$('video-asset-tag').onchange = renderAssets;
async function refreshList() {
  const projects = await api('');
  $('video-list').replaceChildren(...projects.map(project => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = project.title;
    button.classList.toggle('active', project.id === selected);
    button.onclick = () => openProject(project.id).catch(showError); return button;
  }));
}
async function openProject(id) {
  clearTimeout(timer); selected = id;
  const project = await api('/' + id);
  if (selected !== id) return;
  $('video-title').textContent = project.title; $('video-description').textContent = 'Review your project, then render when ready.';
  $('video-subtitle').textContent = project.subtitle || 'None'; $('video-narration').textContent = project.narration || 'None';
  $('video-duration').textContent = `Minimum length: ${project.duration} seconds. Narration may extend it.`;
  $('chosen-visual').hidden = !project.asset_id;
  if (project.asset_id) $('chosen-visual-image').src = `/api/videos/assets/${project.asset_id}/image`;
  else $('chosen-visual-image').removeAttribute('src');
  $('video-review').hidden = false; $('render').hidden = project.status.state !== 'draft';
  $('render-state').textContent = project.status.message || ({draft:'Ready to render.',queued:'Queued. Start the VideoLab worker if it is not running.',running:'Rendering…',complete:'Video ready.',failed:'Rendering failed.'}[project.status.state] || project.status.state);
  const ready = project.status.state === 'complete'; $('video-player').hidden = !ready; $('download').hidden = !ready;
  if (ready) { const url = '/api/videos/' + id + '/file'; if ($('video-player').getAttribute('src') !== url) $('video-player').src = url; $('download').href = url; $('download').download = 'whitesheep-video.mp4'; }
  else { $('video-player').removeAttribute('src'); }
  await refreshList();
  if (['queued','running'].includes(project.status.state)) timer = setTimeout(() => openProject(id).catch(showError), 3000);
}
$('video-form').onsubmit = async event => {
  event.preventDefault(); $('video-status').textContent = ''; const button = event.target.querySelector('button'); button.disabled = true;
  try { const data = Object.fromEntries(new FormData(event.target)); data.duration = Number(data.duration); data.asset_id = data.asset_id || null; const project = await api('', data); event.target.reset(); await openProject(project.id); $('video-status').textContent = 'Project saved locally. Review it before rendering.'; }
  catch (error) { showError(error); } finally { button.disabled = false; }
};
$('render').onclick = async () => {const id = selected; $('render').disabled = true; try {await api('/' + id + '/render', {}); await openProject(id);} catch (error) {showError(error);} finally {$('render').disabled = false;}};
$('asset-form').onsubmit = async event => {event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true; try {const data = Object.fromEntries(new FormData(event.target)); data.tags = parseTags(data.tags); await api('/assets', data); event.target.reset(); $('video-status').textContent = 'Asset queued for local Blender rendering.'; await refreshAssets();} catch (error) {showError(error);} finally {button.disabled = false;}};
function nextImageSeed() { return crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff; }
$('image-form').elements.seed.value = nextImageSeed();
$('image-form').onsubmit = async event => {event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true; try {const worker = await api('/image/worker'); if (!worker.running) throw new Error('The local image worker is not running. Complete image setup and start it first.'); const data = Object.fromEntries(new FormData(event.target)); data.tags = parseTags(data.tags); data.seed = Number(data.seed); await api('/assets/image', data); event.target.elements.seed.value = nextImageSeed(); $('video-status').textContent = 'Image queued for local generation.'; await refreshAssets();} catch (error) {showError(error);} finally {button.disabled = false;}};
$('generated-form').onsubmit = async event => {event.preventDefault(); const button = event.target.querySelector('button'); generating = true; review = null; reviewToken++; $('generated-review').hidden = true; $('generated-code').textContent = ''; $('generated-approve').disabled = true; button.disabled = true; $('video-status').textContent = 'The local model is preparing a new draft. This can take a few minutes.'; try {const data = Object.fromEntries(new FormData(event.target)); data.tags = parseTags(data.tags); const draft = await api('/assets/generated/draft', data); await refreshAssets(); await reviewGenerated(draft.id); $('video-status').textContent = 'New draft generated. Compare the prompt with its code before approving.';} catch (error) {showError(error);} finally {generating = false; button.disabled = false;}};
async function reviewGenerated(id) {
  const token = ++reviewToken;
  const [asset, result] = await Promise.all([api(`/assets/${id}`), api(`/assets/${id}/code`)]);
  if (token !== reviewToken) return;
  review = {id, hash: result.code_hash};
  $('generated-review-subject').textContent = `Asset: ${asset.name} · Prompt: ${asset.prompt}`;
  $('generated-code').textContent = result.code;
  $('generated-hash').textContent = `Code SHA-256: ${result.code_hash}`;
  $('generated-approve').disabled = result.code_hash !== result.original_hash;
  if (result.code_hash !== result.original_hash) $('generated-hash').textContent += ' — Code changed. Create a new draft.';
  $('generated-review').hidden = false;
  $('generated-review').scrollIntoView({behavior:'smooth', block:'nearest'});
}
async function refreshGeneratedWorker() {
  try {
    const worker = await api('/generated/worker');
    $('generated-worker-status').textContent = worker.running ? 'Reviewed-scene helper is running locally.' : 'Reviewed-scene helper is stopped. Run scripts/start-videolab.ps1 before approving a render.';
  } catch (error) { $('generated-worker-status').textContent = 'Could not check the local helper.'; }
  setTimeout(refreshGeneratedWorker, 10000);
}
$('generated-approve').onclick = async () => {if (!review) return; const button = $('generated-approve'); button.disabled = true; try {await api(`/assets/${review.id}/approve`, {code_hash:review.hash}); $('generated-review').hidden = true; review = null; $('video-status').textContent = 'Approved. The local helper will render this exact code if it is running.'; await refreshAssets();} catch (error) {showError(error); button.disabled = false;}};
refreshList().catch(showError);
refreshAssets().catch(showError);
refreshGeneratedWorker();
async function refreshImageWorker() {
  try {const worker = await api('/image/worker'); $('image-worker-status').textContent = worker.running ? 'Local image worker is running.' : 'Image worker is stopped. See the Stable Diffusion setup in the README.';}
  catch (error) {$('image-worker-status').textContent = 'Could not check the image worker.';}
  setTimeout(refreshImageWorker, 10000);
}
refreshImageWorker();
