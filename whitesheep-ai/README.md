# WhiteSheep v0.1

A local AI workspace for moving from ideas to implementation. Your project carries
requirements, decisions, and history; the language model is replaceable.

## This milestone

- WhiteSheep Core: FastAPI, local Ollama chat with `qwen3.5:4b`, and configurable model routes.
- Browser chat, multiple saved conversations, and explicit assistant/model selection per conversation.
- IdeaLab projects with append-only requirements, decisions, notes, and event history.
- PostgreSQL persistence, pgvector extension, and a reserved vector table for later retrieval.
- CodeLab foundation: explicitly enabled source-file listing/reading, with read-only mounts,
  path restrictions, bounded reads, per-agent and per-repository grants, confirmation, and audit history.
- Agent Hub foundation: validated profiles and a closed tool registry. No plugin loading or generated tool execution.
- Six selectable local guidance skills: ideation, feasibility, FastAPI, Agile delivery, DevOps, and agriculture.
- Four Superpowers-inspired skills for brainstorming, planning, debugging, and review.
- VideoLab: local, reviewed title-and-narration video projects using the existing offline studio renderer.

**Not yet implemented:** document upload, embeddings/RAG retrieval, streaming responses,
automatic repository analysis, code changes, shell execution, autonomous agents, authentication
for multiple users, Filipino-language specialization, and community plugins.

## Start on Windows / Docker Desktop

Use Linux containers. Initial image/dependency/model acquisition needs internet access;
chat and all runtime services run locally afterward. No accounts or paid model API keys are needed.

```powershell
cd path\to\IoT-Projects\whitesheep-ai
.\scripts\setup.ps1
docker compose build
```

Provision the model once. If your local Ollama already has Qwen3.5:4B, copy its cache:

```powershell
.\scripts\import-local-models.ps1
```

The script copies the model cache into a dedicated Docker volume; it does not modify
host models. For a different cache location, supply `-ModelsPath 'D:\Ollama\models'`.
Stop any WhiteSheep inference before importing. It copies all models in that cache.

Alternatively, download into WhiteSheep's model volume using a **one-off provisioning container**:

```powershell
docker compose stop ollama
docker compose -f compose.yaml -f compose.download.yaml --profile download run --rm --no-deps model-download
```

The downloader has outbound access to retrieve weights and no published port. Never include
`compose.download.yaml` in runtime `up` commands. The app and database are not on its network.

Start (CPU, the portable default):

```powershell
docker compose up -d --wait
```

For a supported NVIDIA GPU with Docker GPU access:

```powershell
docker compose -f compose.yaml -f compose.gpu.yaml up -d --wait
```

Open **http://127.0.0.1:8765**. Create an IdeaLab project, save a requirement or decision,
then ask a question. Reloading the page lets you reopen the saved project/conversation.
Qwen's first response takes longer while the model loads. CPU inference can be slow;
`timeout_seconds` in model settings controls the upper wait limit.

On Linux/macOS, create `.env` with a random hexadecimal `POSTGRES_PASSWORD`, then use
the same Compose commands. PowerShell setup helpers are optional on those systems.

## Configure

| File | Responsibility |
| --- | --- |
| `config/models.yaml` | Named model routes, local endpoint, context/output limits, temperature, timeout |
| `config/agents.yaml` | Assistant instructions, default route, permitted tools |
| `config/skills.yaml` | Locally maintained, user-selected guidance for individual messages |
| `config/projects.yaml` | Project defaults, allowed memory kinds, explicitly granted repositories |
| PostgreSQL volume | Actual projects, memory, conversations, history, tool audit |

Restart the app after editing YAML: `docker compose restart app`. Configuration is validated
at startup and mounted read-only. Existing conversations retain their agent and route;
start a new conversation to select another. Keep old route names if you want old chats to remain usable.
Adding another local Ollama model means provisioning it, then adding a route in `models.yaml`.
The small adapter interface in `app/router.py` replaces the need for a LiteLLM proxy in this milestone.
No remote provider, URL supplied by a chat message, automatic fallback, or cloud model is accepted.

Project memory is supplied directly as bounded context. Older messages and excess memory can be
omitted from inference to fit the configured context; the full data stays in the database.
The UI reports when context is truncated. Memory is explicitly saved by the user, never silently
extracted from model suggestions. Requirements/decisions are append-only for now; add a new note
to correct an earlier entry. Project history shows the most recent 200 events.

### Skills

Choose **WhiteSheep Core** or **Superpower Core** in **Skill category**, then choose a skill in
**Skill for next message** before sending. The selected guidance is applied to
that message, recorded alongside the turn, and shown when the conversation is reopened. The
selection remains in the control until changed; choose **No skill** to stop using it. These are
short, locally configured prompts, not executable plugins or automatically selected tools. They
do not grant new capabilities. The model may not follow every instruction; review its output.
The agriculture skill supports crop planning and agricultural IoT questions, but does not train or
update the model and does not provide verified local agronomic advice or access to live information.
The Agile/DevOps guidance draws on MegaBus's `CONTRIBUTING.md`, decision 003, and safe migration
runbook, while adapting branch names and processes to the current project. Edit `config/skills.yaml`
and restart the app to update guidance; there is no dynamic plugin installation.
Startup adds the new `message_skills` table without changing existing conversations; back up the
database before upgrading. Skill guidance consumes model context, so long requests may need shortening.

Superpower Core contains four local adaptations, not the upstream Superpowers plugin or
autonomous agents. Skills add no tool permissions. Existing conversations using the earlier
Superpowers-inspired assistants remain available, but those profiles cannot be selected for new
conversations. See [Superpowers-inspired skills](docs/SUPERPOWERS.md)
for usage, limitations, attribution and license.

## Enable a repository (optional)

Copy a **sanitized** repository into `repositories/demo`, then opt in:

```yaml
# config/projects.yaml (retain the other existing keys)
repositories:
  demo:
    path: demo
    tools: [repository.list, repository.read]
```

Restart the app. In **CodeLab & tools**, select the repository, action, and optional relative
file path, then confirm that read. Review the output and paste relevant excerpts into a CodeLab
conversation. The model does not automatically invoke tools. Source is untrusted context.

Dotfiles, common secret filenames, symlinks, traversal, binary files, and files over 32 KiB
are rejected. Listing is bounded to 500 files / 5,000 entries. These filters cannot identify
every secret in ordinary source files: only grant repositories you have reviewed.
No host root, Docker socket, shell, Git execution, writable repository mount, or arbitrary
Python plugin loading is provided.

## Test

Run tests inside the built Linux image, without Ollama inference or a running database:

```powershell
docker compose run --rm --no-deps app python -m pytest -q -p no:cacheprovider
```

Tests use temporary SQLite storage and a deterministic fake model to exercise persistence,
memory injection, routing, retries, failures, browser boundaries, and tool permissions.
Linux execution also verifies symlink rejection. This does not substitute for the real
PostgreSQL/Ollama smoke check below.

With the stack started, run an actual Qwen + PostgreSQL check:

```powershell
python scripts/smoke.py
docker compose restart app db
```

The smoke check creates a clearly named test project and verifies project memory reaches Qwen,
then checks idempotent retries. After restart, reopen that project in the browser; its memory
and two chat messages should remain. It intentionally leaves that project for inspection.
Health checks validate the API/database and Ollama service, not that the configured model has
already been installed. A missing model produces a recoverable chat error.

For host-only unit testing with Python 3.11+:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m pytest -q
```

## VideoLab

VideoLab is a first, intentionally limited integration of the existing VideoStudio environment.
It creates a vertical animated-title video with an optional Piper narration. Create a project,
review the text, and explicitly select **Render this video**. The result can be played and
downloaded from the page. The renderer extends the minimum duration to fit narration.

Create a **Reusable Blender asset** first to render a fixed cube, sphere, or cylinder preset in
a chosen colour. The library keeps a PNG and an editable `.blend` scene; completed PNGs can be
selected as a background in multiple new video projects. Video renders reference one shared image
rather than storing a separate source copy for each project. Rendered videos still take disk space,
and keeping `.blend` files and PNGs also uses space. Inspect and back up the library accordingly.
These are still images of simple presets, not AI-generated models, imported assets, or animated clips.
Add or edit comma-separated tags in the asset library; search or filter by tag, and use the
**Visual tag** dropdown to narrow the backgrounds shown for a new video. Existing untagged assets
remain available under **All tags**. For the prompt-to-Blender assessment and proposed safeguards,
see [Prompt asset feasibility](docs/PROMPT-ASSET-FEASIBILITY.md).

The video and Blender workers currently depend on the original VideoStudio's locally saved
Docker images and Piper voice. Those images and voice files are not included in this repository;
video and Blender rendering are therefore not yet a standalone fresh-clone installation.
With Docker Desktop and the original VideoStudio folder available:

```powershell
.\scripts\start-videolab.ps1
```

Open **http://127.0.0.1:8765/videolab** or select VideoLab in the sidebar. The script verifies
the previously tested `openmontage-studio:base-v1` image identity and copies the existing
Piper voice if needed, then verifies its checksum. If the image is missing, restore it using the
original VideoStudio's documented backup first. For a different studio location pass `-StudioPath`.
Startup needs that saved image and voice; no model or voice is downloaded at runtime.

The standard video and preset asset workers have no network or Docker socket, run as non-root
users, and have a read-only root filesystem. They execute fixed reviewed templates. The separate
experimental prompt-based path below executes reviewed generated code in an isolated per-job
container. Video projects, logs and output live under `video-projects/` and should be
backed up separately; `video-assets/` contains the local voice copy. Both are Git-ignored.
Do not use a substituted image without reviewing it. Renders are queued one at a time. If a
worker is stopped, queued work waits; an interrupted render is marked failed when it restarts.
Create a new project to retry or make a new version. There is no project deletion in this milestone.

The original VideoStudio folder and its existing projects remain separate and unchanged. The
full multi-shot Qwen/Blender video pipeline, scene editing, and import of old projects are not
integrated into VideoLab. VideoLab projects are not yet linked to IdeaLab project memory.

### Experimental prompt-based assets

VideoLab can generate a **still asset** using Qwen and the original VideoStudio scene helper
library. Open **Generate an asset from a prompt**, describe a simple scene, then inspect the
generated Python. Nothing is run until you explicitly approve that exact code hash. Approved
code is checked again and executed in a fresh, resource-limited offline Blender container with
only that asset's job/output folders mounted; no Docker socket, other project folders, credentials,
or host home directory are mounted. A local host helper starts and removes the job container;
it does not give the WhiteSheep web app or Blender container Docker access. The helper starts
when you run `start-videolab.ps1` and exits after its current job if you run
`scripts/stop-generated-worker.ps1`. It does not start automatically with Windows.

The checks reject unsupported Python syntax, imports and calls, limit complexity, verify the
approval hash and image identity, inspect object counts and finite transforms, render a PNG,
and reject a blank/uniform result. The **Quality checks** button displays a report with hashes.
For new drafts, a subject check rejects the generic prebuilt mascot for specific subjects and
requires multi-part geometry for a dog/puppy request. The review panel shows the exact asset name
and prompt alongside its code and clears the previous review whenever a new draft starts. These
are narrow checks against known failure modes, not a general visual-similarity test.
These checks do not prove the image matches the prompt, prevent every harmful program, or make
Docker a complete security boundary. Review generated code and visual output. Unrecognized code,
model-format failures, or interrupted jobs are rejected; create a new draft to retry. The model
may make one correction to a draft that fails preflight; execution failures are not silently
repaired. There is no arbitrary script upload, automatic approval, or full animated-scene pipeline.
See [prompt asset feasibility](docs/PROMPT-ASSET-FEASIBILITY.md) for the earlier assessment and
remaining tradeoffs. The original VideoStudio remains available separately for its full workflow.

## Data and lifecycle

`docker compose stop` stops WhiteSheep. `docker compose down` removes its containers/network,
but retains data volumes. **Do not use `down -v` unless you intend to delete all WhiteSheep data.**
Keep `.env` private and retain it with backups; changing its password does not automatically
change the password in an existing PostgreSQL volume.

Create a database backup without shell redirection encoding issues:

```powershell
docker compose exec db pg_dump -U whitesheep -d whitesheep -Fc -f /tmp/whitesheep.dump
docker compose cp db:/tmp/whitesheep.dump ./whitesheep.dump
```

Backups contain your private chat/project data. Store them privately. The model volume can
be reimported/re-downloaded. v0.1 establishes schema baseline 1; future schema changes need
versioned migrations before upgrading an existing installation.

## Local boundary

Only `127.0.0.1:8765` is published, through a fixed-upstream Nginx gateway. The API,
Ollama, and PostgreSQL use only an internal Docker network and have no host ports.
The gateway also uses a dedicated ingress bridge with outbound masquerading disabled and
no external DNS resolver. It forwards only to the API, never to a user-supplied destination.
This extra gateway is needed because Docker Desktop does not publish ports on the internal-only network.
Ollama cloud features are disabled. The app and gateway run as non-root users with read-only filesystems and no
Linux capabilities; config/repositories are read-only mounts. No telemetry, CDN, analytics,
external fonts, browsing, or public hosting is included.

This is a **single-user local app**, not a multi-tenant security boundary. A trusted local
process or another person using your OS account can access it. Browser-origin/host checks and
a custom request header defend against ordinary cross-site writes; they are not login auth.
Docker administrators can access containers/volumes. Do not expose the port through a tunnel,
LAN binding, or external reverse proxy. Do not add host routes or forwarding rules for the
ingress subnet; disabling masquerading assumes standard Docker bridge networking, not a
custom routed network. See `docs/ARCHITECTURE.md` for design limits and next milestones.

Implementation references: [Ollama chat API](https://docs.ollama.com/api/chat),
[Ollama local/cloud settings](https://docs.ollama.com/faq),
[Docker internal networks](https://docs.docker.com/reference/compose-file/networks/),
[Qwen3.5 model tags](https://ollama.com/library/qwen3.5).

## License

WhiteSheep source is MIT licensed. Dependencies and model weights retain their own licenses.

### Optional local image generation

VideoLab can create reusable 512×512 images with a local Stable Diffusion v1.5 model, using the same Diffusers approach as OpenMontage's `local_diffusion` tool. It saves the prompt, negative prompt, seed and tags with each image. Images appear in the asset library and can be selected as video backgrounds or downloaded for use as Blender references or textures. They are 2D, not 3D meshes or Blender scenes; an image-to-3D model would be a separate feature.

On Windows with Docker Desktop, the NVIDIA container runtime and an NVIDIA GPU, install the optional worker and model once:

```powershell
.\scripts\setup-image-model.ps1
.\scripts\start-image-worker.ps1
```

The setup downloads several GB for the GPU runtime and the fp16 model from [Stable Diffusion v1.5](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5), which uses the CreativeML OpenRAIL-M license. Check that license before distributing or using the model. The model is kept under `image-model/` and is not committed. Only setup accesses the internet: the generation worker has no network, mounts the model read-only, and runs separately from chat and the video workers. It never executes generated code. Then open VideoLab, expand **Generate an image with Stable Diffusion**, and submit a prompt. Start WhiteSheep first with the core Compose command above. The separate image generator does not require the original VideoStudio images or Piper voice.

The 6 GB GPU may run out of memory when Ollama or other applications are using it. If generation fails for lack of GPU memory, wait for Ollama to unload its model or stop other GPU workloads, then submit a new image. Use `docker compose -f compose.yaml -f compose.image.yaml --profile image stop image-worker` to stop the optional worker. Generated images may not match the prompt and should be inspected before use.
