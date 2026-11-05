# Superpowers-inspired skills

WhiteSheep offers four local skills inspired by [obra/superpowers](https://github.com/obra/superpowers):
Brainstorm, Plan, Debug, and Review. In any conversation, choose **Superpower Core** under
**Skill category**, then select a skill for the next message. The assistant and local model remain
independently selected and can use the current project's saved context. Only one skill applies per
message. Choose **No skill** to send without skill guidance.

These are compact adaptations of concepts from upstream brainstorming, writing-plans,
systematic-debugging, and requesting-code-review. They are WhiteSheep skills, **not the upstream
Superpowers plugin or its agents**, and they do not implement its full workflows, automatic skill
discovery, multi-agent delegation, Git/worktree access, tests, file writes, browsing or execution.
The source files/code to discuss must be provided by the user; for CodeLab's separate read-only tool,
grant and confirm a repository read and paste relevant output into the conversation. No tool grants
are added by these skills. They cannot automatically read a repository or save their answers.

Conversations started with the earlier Superpowers-inspired assistant profiles remain accessible
and continue to use those profiles. The profiles are hidden for new conversations; use the skills
instead. Existing conversation and message records are not modified by this reorganization.

Responses depend on the selected model and its available context. Local Qwen3.5:4B may miss
instructions or make mistakes; inspect suggestions and verify them before use. Output is guidance,
not proof that any test or review happened. The upstream optional visual companion is not included.

The upstream Superpowers project is MIT licensed, copyright (c) 2025 Jesse Vincent. Its license
is reproduced in [SUPERPOWERS-LICENSE](SUPERPOWERS-LICENSE).
