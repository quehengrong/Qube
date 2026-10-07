# Qube 安装与使用

这是面向个人设备的预览版。先在 Windows 安装桌面程序，再安装手机 APK。构建产物位于 GitHub Actions 每次成功运行的 Artifacts 中；它们不是应用商店签名发行版。

## 1. Windows

从 [构建记录](https://github.com/quehengrong/Qube/actions) 下载 `Qube-Windows-x64-preview` 中的安装程序。运行后，关闭窗口会缩小到系统托盘；从托盘菜单退出才会停止服务和托管的终端。

本地语音识别首次配置：

1. 安装 Python 3.11、适用于显卡的 NVIDIA 驱动、CUDA 12 和 cuDNN 9。faster-whisper 的具体运行库要求见其官方 README。
2. 在仓库 `services/speech` 中运行 `setup.ps1`，把输出的 Python 路径填入 Qube 设置的 `pythonPath`。
3. 保存设置，点击“检查语音服务”。第一次识别会下载 `large-v3-turbo` 模型；模型下载需要访问 Hugging Face。可提前在已配置的 Python 环境运行 `from faster_whisper import WhisperModel; WhisperModel('large-v3-turbo', device='cuda', compute_type='int8_float16')` 完成下载。
4. 如需 CPU 验证，在启动 Qube 前设置环境变量 `QUBE_DEVICE=cpu`、`QUBE_COMPUTE=int8`；这不代表能达到 GPU 延迟目标。

配套程序仅启动回环地址上的语音服务。录音只在内存中处理，不自动写入磁盘。关闭 Qube 会停止语音进程；“释放语音模型显存”可卸载模型，下次识别重新加载。

## 2. 手机

安装 `Qube-Android-arm64-preview` 中的 APK，允许必要的通知、麦克风与精确闹钟权限。在 HyperOS 应用设置中允许后台自启动，并将省电策略设为无限制。系统文字转语音中下载中文离线语音包，点击“测试播报”确认可用。

手机和电脑连接同一局域网。电脑打开“连接手机”，手机点击“扫描配对”；有多个网卡时选局域网地址。也可以复制配对 JSON 后在手机粘贴。二维码含令牌，请勿公开分享。

Windows 防火墙只需在专用网络允许 TCP 19431。企业 Wi-Fi 的客户端隔离可能阻止连接；断线后自动重连，但不会自动重发操作或草稿。

点击“开启唤醒词监听”，说“小机小机”，眼睛进入聆听状态后再说指令。监听包含常驻通知，可在应用内停止。重启手机后重新打开应用并启动麦克风监听；提醒由开机接收器恢复，不依赖麦克风。

更换唤醒词目前为高级音素配置：采用 sherpa 中文声母/带声调韵母，以空格分隔，`@` 后为显示名称，例如默认 `x iǎo j ī x iǎo j ī @小机小机`。保存后停止再启动监听，在真机测试命中率。

## 3. CLI 听写

先在 WSL 或 PowerShell 安装并登录 Codex / Claude。Qube 不管理 agent 的账号和授权。

在电脑 Qube 的“编程听写”中选择环境、agent 和实际项目目录，启动会话；WSL 目录填写 Linux 路径，可填写发行版名称。程序通过 `wsl.exe --cd <目录> --exec codex|claude` 启动；若使用 nvm 等交互 Shell 初始化，请确保 CLI 在 WSL 的默认进程 PATH 中可发现。

选中目标会话，说“进入编程听写”。说完需求后，检查手机或电脑草稿；编辑后点“保存修改”。确认 agent 正在输入提示符，再点“确认发送”，或唤醒后单独说“确认发送”。听写正文不会作为电脑操作执行。

Qube 采用终端括号粘贴和回车提交，须在实际 CLI 版本中验证多行行为。agent 权限提示仍需在终端由用户操作。会话退出或手机断线后需重新选择会话。

## 4. 电脑控制

在设置 JSON 的 `applications` 添加软件别名、绝对路径和参数，例如：

```json
{"VS Code":{"path":"C:\\Users\\you\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe","args":[]}}
```

然后说“打开 VS Code”。音乐设置填网易云路径，并把歌单别名映射到客户端可访问控件的实际名称：`playlists: {"我的收藏":"我喜欢的音乐"}`。

网易云与 Windows 控件适配会受系统语言和客户端版本影响。诊断命令（PowerShell，在原生程序目录）：

```powershell
.\Qube.Native.exe '{"action":"inspect","processName":"cloudmusic"}'
.\Qube.Native.exe '{"action":"inspect","processName":"SystemSettings"}'
```

根据结果配置名称。Qube 拒绝名称重复、不可操作或不能核实状态的控件；不会使用固定屏幕坐标兜底。切歌仅报告按钮已操作，不声称已确认新曲目。护眼控制读取并验证 TogglePattern 的状态；如果目标系统不暴露该模式，应保留失败信息并补专用适配。

## 5. 提醒

说“明天下午三点开会，提前十分钟提醒我”，在手机确认后才保存。第一版语音支持新建和查看；编辑、完成、取消和延后可在手机操作。

手机手动表单使用上海时间 `yyyy-MM-dd HH:mm`。提前时间已过去但事项时间未到时，会尽快提醒。单次提醒触发后标记“已提醒”；重复提醒自动安排下一次。“稍后十分钟”为重复提醒创建独立的单次提醒，不移动原来的重复时间。

电脑关机不影响已保存提醒。关闭精确闹钟权限、禁用通知、系统强制停止应用或手机关机期间不能保证播报；应用展示权限状态，重开后恢复调度并标出逾期事项。

## 从源码构建

```sh
npm ci
npm run build -w @qube/protocol
npm run check
npm test
npm run build
```

Windows 安装包（Windows + .NET 8 SDK）：

```powershell
dotnet publish apps/windows/native/Qube.Native.csproj -c Release -r win-x64 --self-contained true -o apps/windows/native/publish
npm run dist:win
```

Android（JDK 17、Android SDK 35、Gradle 8.11.1）：

```sh
python3 scripts/fetch-android-assets.py
gradle -p apps/android testDebugUnitTest assembleDebug lintDebug
```

构建下载 sherpa AAR 与唤醒模型并核对 SHA-256；不将模型加入 Git。Android 产物是 debug 签名，正式分发前需配置私人签名密钥。桌面包未配置代码签名。
