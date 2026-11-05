# WhiteSheep v0.1 architecture

Browser (localhost:8765) → fixed-upstream Nginx gateway → FastAPI → model router → Ollama / Qwen3.5:4B

FastAPI → PostgreSQL + pgvector

Explicit user action → tool registry → configured read-only repository

The first coherent milestone connects an IdeaLab project to persistent conversations and
explicit memory. It does not try to implement the entire future assistant platform.

## Separation

Models are routes; agents are behavior/tool profiles; projects are durable user data.
Changing a model does not erase project state. A conversation records its agent and route,
and each assistant message records the underlying model tag. A small Ollama adapter provides
the replaceable inference boundary without a proxy service or cloud dependencies.

The model receives bounded recent conversation turns and recent project memory. UTF-8 byte
budgets are deliberately conservative and reserve output/context overhead. There is no
embedding retrieval yet. `knowledge_chunks` has a `vector(768)` placeholder for a later local
embedding route; introducing a different embedding dimension requires a schema migration.

## Persistence and concurrency

All writes use database transactions. User/assistant message pairs are committed together
after successful inference. A client UUID plus a unique conversation/request/role constraint
supports safe retries. Failed inference writes neither half of a turn. The browser preserves
the draft and retry ID. A single process lock admits one inference at a time and rejects
overlapping requests with a retryable 409. Run **one Uvicorn worker**. Multiple workers or
replicas require a database-backed lease or queue; this version is intentionally single-user.

Project history is append-only. No destructive project/chat endpoint is exposed in v0.1.
The startup schema creator is a baseline, not a general migration framework. PostgreSQL
initialization enables pgvector. The database role owns this isolated application database;
it must not be reused for other applications.

## Trust boundaries

- Chat/model output is rendered with `textContent`, not interpreted as HTML. VideoLab's separate,
  explicitly reviewed generated-scene path can execute generated Python in an isolated per-job
  container, as described in the README; it is not a general assistant tool.
- Model calls never receive executable tools. Agent tool declarations are permission metadata.
- Tool execution requires a user-initiated API action, confirmation, agent grant, and repository grant.
- Unknown tools, remote model endpoints, invalid route references, and extra YAML keys fail closed.
- Allowed Agent Hub tools are source listing and UTF-8 file reads. The Agent Hub does not provide
  command execution, source writes, Git operations, or dynamically imported plugins.
- Repository mount is read-only; filenames and resolved paths are checked, and symlinks rejected.
  A hostile local process concurrently changing a bind mount is outside this single-user threat
  model. Use a static sanitized copy for inspection, not an actively mutated untrusted checkout.
- Host and Origin checks, no permissive CORS, a custom mutation header, request-size limits,
  and a restrictive content policy protect the browser boundary.
- The API, database, and Ollama use only an internal network. A minimal unprivileged gateway
  connects that network to a loopback-published ingress bridge. Outbound masquerading is
  disabled on ingress, and the gateway's DNS cannot forward external lookups. Its fixed
  upstream is the API; it is not an open proxy. This assumes normal Docker bridge routing;
  do not install custom routes/forwarding for the ingress subnet.
- A separate, opt-in model download container
  has outbound network access for provisioning and shares only the model volume.

## Deferred, in order

1. Versioned schema migrations, export/delete flows, and richer project memory editing.
2. Local document ingestion and an independently configurable embedding model; retrieval citations.
3. CodeLab repository snapshots, explicit file selection, and source-cited analysis using project context.
4. Typed tool contracts and richer permission/audit interfaces before any additional tool capabilities.
5. Proposal-only patches, followed by separately designed and authorized execution isolation.
6. Filipino-language evaluation/adaptation and community extensions after the local core is stable.

No public service, community plugin installer, or autonomous execution is part of this milestone.
