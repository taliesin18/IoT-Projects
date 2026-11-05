param([string]$StudioPath = (Join-Path $env:USERPROFILE 'OneDrive/Documents/ChatGPT/Video Generation/VideoStudio'))
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$expectedImage = 'sha256:bc3611bdcfcf8c809d8c3470b82a4a1657b65de4ad16f83d3cb325b8b7720a8a'
$actualImage = docker image inspect openmontage-studio:base-v1 --format '{{.Id}}'
if ($LASTEXITCODE -ne 0 -or $actualImage -ne $expectedImage) { throw 'The saved VideoStudio base image is missing or has changed. Restore it from the original VideoStudio backup first.' }
$expected3d = 'sha256:349d1f7665cfe9baaf6e4615c52377783decd96fd8f48d7d60b5efebfa51c034'
$actual3d = docker image inspect openmontage-studio:3d-v1 --format '{{.Id}}'
if ($LASTEXITCODE -ne 0 -or $actual3d -ne $expected3d) { throw 'The saved VideoStudio 3D image is missing or has changed. Restore it from the original VideoStudio backup first.' }
New-Item -ItemType Directory -Force -Path video-assets,video-projects | Out-Null
$expectedVoice = '5EFE09E69902187827AF646E1A6E9D269DEE769F9877D17B16B1B46EEAAF019F'
$voice = 'video-assets/en_US-lessac-medium.onnx'
$voiceConfig = 'video-assets/en_US-lessac-medium.onnx.json'
if (-not (Test-Path -LiteralPath $voice)) { Copy-Item -LiteralPath (Join-Path $StudioPath 'voices/en_US-lessac-medium.onnx') -Destination $voice }
if ((Get-FileHash -LiteralPath $voice -Algorithm SHA256).Hash -ne $expectedVoice) { throw 'Piper voice checksum mismatch. Check the source and local copy.' }
if (-not (Test-Path -LiteralPath $voiceConfig)) { Copy-Item -LiteralPath (Join-Path $StudioPath 'voices/en_US-lessac-medium.onnx.json') -Destination $voiceConfig }
docker compose -f compose.yaml -f compose.gpu.yaml --profile video up -d --build --wait
if ($LASTEXITCODE -ne 0) { throw 'VideoLab startup failed.' }
$python = Get-Command python -ErrorAction Stop
$workerFile = Join-Path (Get-Location).Path 'videolab/generated_worker.py'
$stopFile = Join-Path (Get-Location).Path 'video-projects/.generated-worker-stop'
if (Test-Path -LiteralPath $stopFile) { Remove-Item -LiteralPath $stopFile -Force }
Start-Process -FilePath $python.Source -ArgumentList @('"' + $workerFile + '"') -WorkingDirectory (Get-Location).Path -WindowStyle Hidden | Out-Null
Write-Host 'Started the reviewed-scene helper (only one instance accepts jobs).'
Write-Host 'VideoLab is ready at http://127.0.0.1:8765/videolab'
