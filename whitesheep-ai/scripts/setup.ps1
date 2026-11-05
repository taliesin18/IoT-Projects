$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path -LiteralPath '.env')) {
    $randomBytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($randomBytes)
    $rng.Dispose()
    $password = -join ($randomBytes | ForEach-Object { $_.ToString('x2') })
    Set-Content -LiteralPath '.env' -Value "POSTGRES_PASSWORD=$password" -Encoding ascii
    Write-Host 'Created local database credentials in .env.'
} else {
    Write-Host 'Keeping existing .env credentials.'
}
New-Item -ItemType Directory -Path 'repositories' -Force | Out-Null
docker compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Compose configuration did not validate.' }
Write-Host 'Ready. See README.md for model provisioning and startup.'
