$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path -LiteralPath 'image-model/model_index.json')) {
    throw 'No image model found in image-model. Follow the Stable Diffusion setup in README.md first.'
}
docker image inspect whitesheep-image-worker:local | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Image worker is not installed. Run scripts/setup-image-model.ps1 first.' }
docker compose -f compose.yaml -f compose.image.yaml --profile image up -d --no-build --no-deps image-worker
if ($LASTEXITCODE -ne 0) { throw 'Could not start the local image worker.' }
Write-Host 'Local image worker started. Open VideoLab to generate an image.'
