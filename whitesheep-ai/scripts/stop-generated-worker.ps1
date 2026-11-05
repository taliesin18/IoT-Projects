$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force -Path 'video-projects' | Out-Null
Set-Content -LiteralPath 'video-projects/.generated-worker-stop' -Value 'stop after current job'
Write-Host 'The generated-scene helper will stop after its current job. Other VideoLab services remain running.'
