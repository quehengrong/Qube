$ErrorActionPreference = 'Stop'
$venv = Join-Path $env:LOCALAPPDATA 'Qube\speech-venv'
py -3.11 -m venv $venv
if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.11 first.' }
$python = Join-Path $venv 'Scripts\python.exe'
& $python -m pip install -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Speech dependencies failed to install.' }

# GPU inference needs cublas64_12.dll and cudnn*_9.dll. CTranslate2 rarely bundles cublas,
# and the pip wheels place these DLLs under site-packages\nvidia\*\bin, which is not on the
# Windows loader search path: without registration the first GPU transcription fails with
# "Library cublas64_12.dll is not found or cannot be loaded". Install the wheels and write a
# .pth so every interpreter start registers those directories before CTranslate2 loads them.
# If the wheels cannot be installed (offline, or a mirror that lacks them), keep going: CPU
# inference still works with QUBE_DEVICE=cpu and QUBE_COMPUTE=int8.
& $python -m pip install nvidia-cublas-cu12 nvidia-cudnn-cu12
if ($LASTEXITCODE -eq 0) {
  $site = Join-Path $venv 'Lib\site-packages'
  $registration = @"
import os as _os, glob as _glob
_dirs = sorted(_glob.glob(_os.path.join(r'$site', 'nvidia', '*', 'bin')))
if _dirs:
    _os.environ['PATH'] = _os.pathsep.join(_dirs + [_os.environ.get('PATH', '')])
    _handles = []
    for _d in _dirs:
        try:
            _handles.append(_os.add_dll_directory(_d))
        except Exception:
            pass
    import sys as _sys
    _sys._qube_nvidia_dll_handles = _handles
"@
  $registration | Set-Content (Join-Path $site 'qube_nvidia_dlls.pth') -Encoding ascii
  Write-Output 'Registered CUDA library directories for GPU inference.'
} else {
  Write-Output 'NVIDIA runtime wheels could not be installed; GPU inference may be unavailable.'
}

Write-Output "Qube settings pythonPath: $python"
Write-Output 'First transcription downloads the model; without CUDA/cuDNN set QUBE_DEVICE=cpu and QUBE_COMPUTE=int8.'
