# Feasibility: prompt-based reusable Blender assets

Assessment date: 5 November 2026. This documents the original assessment. The user subsequently
chose the generated-code alternative; VideoLab now includes an experimental, explicitly reviewed
still-asset workflow. See the README for its current capabilities and limitations.

## Finding

**Feasible in stages.** A text prompt can be turned into a structured description of a simple
scene, reviewed by the user, and rendered locally with Blender. The current reusable-asset worker
already renders a fixed cube, sphere, or cylinder and saves both a PNG and a Blender scene.
That preset path does not interpret prompts or support multiple objects; the separate experimental
generated-code path uses the original scene helpers and allows multiple objects.

The earlier VideoStudio's `LOCAL_PIPELINE.md` and `pipeline.py` demonstrate a different, more
capable approach: Qwen proposes video plans and generates Python scene programs, which are checked
and executed by Blender in an offline Docker environment after approval. The saved
`projects/pipeline-smoke-test/renders` directory contains an MP4 and verification artifacts; the
older `verification/RESULTS.md` also records a separate test using previously rendered 3D footage.
Those observations do not establish the visual quality or repeatability of arbitrary prompts.

On inspection, the earlier studio's `pipeline_config.json` names `qwen3:8b`; its documentation
also refers to `qwen2.5:7b`. Neither is currently in the local Ollama model list, which contains
`qwen3.5:4b` and `nomic-embed-text`. Therefore the older workflow cannot be assumed to run as
configured without a model change or download. No download was performed for this assessment.
The existing studio and WhiteSheep use different project storage and controller interfaces.

## Recommended first implementation

1. Accept a prompt and have the local model propose a **bounded JSON scene plan**, not Python.
   Support a small approved vocabulary: shapes, dimensions, positions, colours, camera and lighting.
2. Validate the result server-side: exact schema, supported values, object and resource limits,
   numerical bounds, and no paths, commands, expressions, scripts, or external URLs.
3. Show the interpreted scene to the user for review and correction. A separate explicit action
   queues the approved plan. Bind approval to an exact plan version; changes require review again.
4. Have the existing network-isolated Blender worker interpret the validated data through fixed,
   reviewed code. Save an image and scene in the reusable library, with prompt, plan, model route,
   timestamps, and output hashes as provenance. Existing tag selection can find the result.
5. Evaluate a small set of prompts on the actual local Qwen3.5:4B model: schema validity,
   correction/approval behavior, render success, visual match, duration, memory use and disk usage.
   Retain failures and results; do not infer quality from the model name.

This approach can cover compositions made from approved primitives. It cannot promise a recognisable
lettuce plant, photorealistic objects, text-to-3D meshes, complex animations, or faithful arbitrary
instructions. Adding those would require a richer scene vocabulary, authored assets, or additional
models and separate evaluation. Image reuse saves rerendering and duplicate source copies, but the
scene, preview, cache and final videos consume space; retention and backup controls remain future work.

## Alternative: reuse the original generated-code workflow

It has a head start for stylized multi-object/animated scenes, but generated Python executes inside
Blender. Static checks and Docker isolation reduce some risks; they do **not** make arbitrary code
safe. Integrating that path would need an explicit change to WhiteSheep's original no-unsafe-tool-
execution boundary, a separate threat review, restricted per-job storage and resources, no Docker
socket or secrets inside the worker, review/approval and restart behavior, plus local model tests.
It should not be exposed through an automatic prompt-to-run button. The subsequent implementation
uses explicit review of the exact code, a separate host launcher, and an offline per-job container;
these controls reduce risk but are not proof of safety. It produces still assets, not the full
original multi-shot workflow. Model reliability and visual fidelity still require evaluation.

## Asset management delivered now

VideoLab supports up to ten case-insensitive tags per asset (30 characters each), editing those tags,
search/filter in the library, and filtering the video background selector by tag. Tags organize
selection; they do not automatically pick an asset based on a prompt. Existing untagged assets and
existing video selections remain valid. No deletion, import, or animated-clip support is added here.
