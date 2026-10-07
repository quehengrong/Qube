$ErrorActionPreference = 'Stop'
$venv = Join-Path $env:LOCALAPPDATA 'Qube\speech-venv'
py -3.11 -m venv $venv
if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.11 first.' }
$python = Join-Path $venv 'Scripts\python.exe'
& $python -m pip install -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Speech dependencies failed to install.' }
Write-Output "Qube settings pythonPath: $python"
Write-Output 'GPU inference requires CUDA 12 and cuDNN 9. First transcription downloads the model.'
