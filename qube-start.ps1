<#
  启动 Qube 电脑端（源码模式）。
  用法：右键“使用 PowerShell 运行”，或在 PowerShell 里执行：  .\qube-start.ps1

  它做四件事：
    1. 清掉当前环境里的 ELECTRON_RUN_AS_NODE（不清理的话 Electron 会退化成纯 Node，界面起不来）；
    2. 把 services\speech 加进 PYTHONPATH，让语音服务能找到 CUDA 运行库注册模块（sitecustomize.py）；
    3. 没有显式指定时，按显卡是否存在决定 QUBE_DEVICE（cuda / cpu）；
    4. 检查是否已经编译过，没有就先编译，然后启动 Qube 窗口。

  想强制用 CPU（例如显存被别的程序占了）时先设置再启动：
    $env:QUBE_DEVICE = 'cpu'
    $env:QUBE_COMPUTE = 'int8'
    .\qube-start.ps1
#>
$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
$electron = Join-Path $repo 'node_modules\electron\dist\electron.exe'

if (-not (Test-Path $electron)) {
  throw "找不到 Electron：$electron。请先在仓库目录执行 npm ci，再运行 node node_modules\electron\install.js"
}

Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:ELECTRON_DISABLE_SECURITY_WARNINGS = '1'

# 1. 语音服务需要这个模块在解释器启动时被导入，才能注册 CUDA 运行库目录
$speechDir = Join-Path $repo 'services\speech'
$existingPythonPath = $env:PYTHONPATH
if ([string]::IsNullOrEmpty($existingPythonPath)) {
  $env:PYTHONPATH = $speechDir
} else {
  $env:PYTHONPATH = $speechDir + ';' + $existingPythonPath
}

# 2. 没指定设备时按显卡自动选择
if ([string]::IsNullOrEmpty($env:QUBE_DEVICE)) {
  $hasNvidia = $false
  if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    $gpuList = & nvidia-smi -L 2>$null
    if ("$gpuList" -match 'GPU') { $hasNvidia = $true }
  }
  if ($hasNvidia) {
    $env:QUBE_DEVICE = 'cuda'
    $env:QUBE_COMPUTE = 'int8_float16'
  } else {
    $env:QUBE_DEVICE = 'cpu'
    $env:QUBE_COMPUTE = 'int8'
    Write-Host '未检测到 NVIDIA 显卡，语音识别将使用 CPU。'
  }
}

# 3. 没编译过就先编译
if (-not (Test-Path (Join-Path $repo 'apps\windows\dist\main.js'))) {
  Write-Host '首次启动，正在编译…'
  & npm.cmd run build
}

Write-Host "正在启动 Qube…（语音设备：$env:QUBE_DEVICE）"
Write-Host '关闭窗口只会缩到系统托盘，要退出请用托盘菜单里的“退出”。'
& $electron (Join-Path $repo 'apps\windows')
