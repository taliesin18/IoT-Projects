# v0.1 milestone verification

Verified on 4 November 2026 on Windows with Docker Desktop (Linux containers),
an NVIDIA RTX 4050 laptop GPU, and the existing Qwen3.5:4B model cache.

## Delivered

- Local web chat with Core, IdeaLab, and CodeLab assistant profiles.
- Configurable local Ollama routing, bounded project/conversation context, and recoverable inference errors.
- PostgreSQL projects, append-only requirements/decisions/notes, event history, and conversations.
- pgvector 0.8.0 enabled with a reserved knowledge-chunk schema.
- Permission-checked, confirmed, audited repository listing/reading. Repositories are disabled by default.
- Separate model, agent, and project configuration; MIT license; setup and test instructions.

## Checks

- Docker build succeeded.
- 17 tests passed inside Linux Docker, including symlink rejection, path traversal/secret-file
  restrictions, per-agent grants, browser-origin checks, project-scoped lists, bounded context,
  failure rollback, idempotent retries, Ollama request format, and concurrent-request handling.
- JavaScript syntax check passed.
- Actual PostgreSQL + Qwen smoke check passed: a saved requirement established the codename
  Mango, and the local model answered: “The project's codename is Mango.”
- Browser submission passed: a follow-up asked about the saved decision and Qwen answered:
  “The saved decision is to start with one small milestone.”
- Database extension inspection confirmed pgvector 0.8.0.
- Restarted both API and PostgreSQL, waited for healthy services, then read back the same
  project and conversation: both memory entries and all four messages were retained.
- Docker inspection confirmed only the web gateway publishes a host port, bound to 127.0.0.1:8765;
  the API/database/Ollama have none, their network is internal, and ingress masquerading is disabled.

The test project `WhiteSheep smoke check` is retained so its memory and conversation can
be inspected. TestClient emitted one upstream deprecation warning about its HTTP test client;
there were no test failures.

## Boundaries

This is the first coherent local milestone, not a complete agent platform. Vector retrieval,
document upload, automatic CodeLab analysis, code execution/modification, and community plugins
are not implemented. No public deployment, tunnel, remote provider, or external tool was configured.

The chat already belonged to the WhiteSheep AI project when inspected. Implementation lives
in `C:\work\local\whitesheep-ai`; Git ownership comes from `C:\work\local`. The WhiteSheep
folder was empty initially. Existing sibling-project changes were preserved, and no commit or push was made.
