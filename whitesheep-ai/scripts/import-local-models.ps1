param([string]$ModelsPath = (Join-Path $env:USERPROFILE '.ollama/models'))
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$resolvedModels = (Resolve-Path -LiteralPath $ModelsPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $resolvedModels 'blobs'))) { throw 'Expected an Ollama models folder containing blobs.' }
docker compose stop ollama
if ($LASTEXITCODE -ne 0) { throw 'Could not stop WhiteSheep Ollama.' }
docker compose create ollama
if ($LASTEXITCODE -ne 0) { throw 'Could not create WhiteSheep Ollama.' }
$containerId = docker compose ps -aq ollama
if (-not $containerId) { throw 'WhiteSheep Ollama container was not found.' }
docker cp "$resolvedModels/." "${containerId}:/root/.ollama/models"
if ($LASTEXITCODE -ne 0) { throw 'Model import failed.' }
Write-Host 'Copied local model cache into WhiteSheep storage. Host models were not changed.'
