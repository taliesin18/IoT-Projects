$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
Write-Host 'Building the optional GPU image worker and downloading the Stable Diffusion v1.5 fp16 model. This requires several GB and a one-time internet connection.'
docker compose -f compose.yaml -f compose.image.yaml build image-worker
if ($LASTEXITCODE -ne 0) { throw 'Image worker build failed.' }
New-Item -ItemType Directory -Force -Path image-model | Out-Null
$modelDir = (Resolve-Path -LiteralPath image-model).Path
docker run --rm --user 10001:10001 -e HF_HUB_OFFLINE=0 -e TRANSFORMERS_OFFLINE=0 -e HF_HOME=/tmp/huggingface -v "${modelDir}:/model" --entrypoint huggingface-cli whitesheep-image-worker:local download stable-diffusion-v1-5/stable-diffusion-v1-5 --local-dir /model --include model_index.json '*/config.json' '*/preprocessor_config.json' '*/scheduler_config.json' 'tokenizer/*' '*/*.fp16.safetensors'
if ($LASTEXITCODE -ne 0) { throw 'Model download failed; check your connection and retry this script.' }
Write-Host 'Model downloaded. Run scripts/start-image-worker.ps1 to start offline generation.'
