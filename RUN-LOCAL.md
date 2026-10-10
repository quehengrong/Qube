# Qube 本机启动 + REDMI 15R 5G 上手说明

这份说明针对本机当前状态写的（Windows 11 + RTX 4070 Ti + REDMI 15R 5G）。
仓库里的官方文档是 [docs/setup.md](docs/setup.md)，这里是把它落到你这台机器上的可执行版本。

## 一、这个项目是什么

Qube 由三部分组成：

| 部分 | 位置 | 作用 |
| --- | --- | --- |
| 电脑端 | [apps/windows](apps/windows) | Electron 应用：界面、局域网桥接（wss://…:19431）、调用本机语音服务和 Windows 控件 |
| 手机端 | [apps/android](apps/android) | Kotlin/Compose 应用：机械眼睛、唤醒词、提醒、专注计时 |
| 语音服务 | [services/speech](services/speech) | 只在 127.0.0.1:19432 上跑的 faster-whisper 识别服务 |

手机说“小机小机”由**手机本地模型**识别（已随 APK 打包，无网也能唤醒）；识别出的语音用局域网发给电脑，由电脑转成文字，再把指令结果回给手机。

## 二、本机已经准备好的东西

| 项目 | 状态 |
| --- | --- |
| Node 依赖 | 已装好（`npm ci` 完成，放行了 electron / node-pty 的安装脚本） |
| 电脑端编译 | `npm run build` 通过，25 个测试全过 |
| Windows 控件程序 | [Qube.Native.exe](apps/windows/native/publish) 已用 .NET 8 SDK 编译发布 |
| 语音环境 | Python 3.11.8 虚拟环境：`C:\Users\PC\AppData\Local\Qube\speech-venv\Scripts\python.exe`；模型已缓存；**GPU 推理已实测可用** |
| 手机 APK | 已本地编译：`apps\android\app\build\outputs\apk\debug\app-debug.apk`（47 MB，含离线唤醒模型） |

## 三、启动电脑端

双击或在 PowerShell 里运行：

```powershell
powershell -ExecutionPolicy Bypass -File D:\Qube\qube-start.ps1
```

Qube 窗口出现即成功。关闭窗口只是缩到系统托盘，**要真正退出（并停止语音进程和托管的终端）请用托盘菜单里的“退出”**。

> 注意：在当前这套开发环境里启动时，必须先清掉环境变量 `ELECTRON_RUN_AS_NODE`，否则 Electron 会退化成纯 Node、报 `does not provide an export named 'clipboard'`。`qube-start.ps1` 已经替你做了这件事。

## 四、配置语音识别（第一次）

1. 打开 Qube → 「⚙ 设置」→ 把 `pythonPath` 填成
   `C:\Users\PC\AppData\Local\Qube\speech-venv\Scripts\python.exe`，保存（已经替你填好并保存过了）。
2. 点「检查语音服务」。**模型已经在本机下好了**（`large-v3-turbo` 的 CTranslate2 版本，1.51 GB，在 `C:\Users\PC\.cache\huggingface`），不需要再联网下载。
3. **显卡推理已实测可用**：ctranslate2 4.8.2 自带 cuDNN 9，缺的 `cublas64_12.dll` 已用 pip 轮子 `nvidia-cublas-cu12` 补上，并由 `services\speech\sitecustomize.py`（或虚拟环境里的 `qube_nvidia_dlls.pth`）在 Python 启动时注册目录。实测一段中文语音约 4 秒识别完成。
   启动脚本会自动选择 `QUBE_DEVICE=cuda`、`QUBE_COMPUTE=int8_float16`；想强制 CPU 就先设 `$env:QUBE_DEVICE='cpu'`、`$env:QUBE_COMPUTE='int8'` 再启动。
4. 只想试界面和配对的话，这一步可以跳过——语音识别会报错，但配对、提醒、眼睛动画都不受影响。

### 语音对话怎么用

1. 电脑端 Qube 必须在运行（语音服务是它的子进程，退出 Qube 服务就停）。
2. 手机连上电脑后，在「眼睛」页点右下角「点击说话」，说完松开：手机把录音发给电脑，电脑识别成文字并执行指令，结果显示在手机上并播报。
3. 或者先点「开启唤醒词监听」，说「小机小机」，眼睛进入聆听状态后说指令。
4. 说「进入编程听写」可以切到听写模式，把口述内容送进 Codex/Claude 会话。

## 五、手机端：装 APK

1. 手机上先开 USB 调试：**设置 → 我的设备 → 全部参数与信息 → 连点「MIUI 版本」7 次**，然后 **设置 → 更多设置 → 开发者选项 → 打开「USB 调试」**。
2. 数据线插着的时候，把 USB 用途从「传文件」保持即可；手机弹「允许 USB 调试吗」时勾选「一直允许」并确定。
3. 电脑上确认连接（`adb` 已下载到 `D:\Qube-tools\platform-tools`）：

```powershell
& D:\Qube-tools\platform-tools\adb.exe devices -l       # 应看到一行 device，型号 25082RNC1C
```

4. 安装 APK。本机实测：**这台 REDMI 15R 5G 拒绝通过 USB 安装**，报
   `INSTALL_FAILED_USER_RESTRICTED: Install canceled by user`——这是 HyperOS 的策略，需要开发者选项里“USB 调试（安全设置）”类的开关（会弹确认框、可能要求登录小米账号）。
   已把 APK 推到手机里，直接文件安装更省事：

   ```powershell
   & D:\Qube-tools\platform-tools\adb.exe push D:\Qube\apps\android\app\build\outputs\apk\debug\app-debug.apk /sdcard/Download/Qube-0.2.0-debug.apk
   ```

   然后在手机「文件管理 → 手机存储 → Download」里点这个 APK 安装，提示时允许「安装未知应用」。

> 这是**开发签名**的 debug 包，能装能用，但不能覆盖将来 CI 的正式签名包。以后要换成正式包，先在手机里「设置 → 导出备份」，再卸载 debug 包安装新版，然后导入备份（提醒和灵感都在备份里）。

## 六、配对（手机 ↔ 电脑）

1. 电脑 Qube 打开「▦ 连接手机」页，会列出所有网卡各一张二维码。
2. 手机装好 Qube 后打开，点「扫描配对」扫二维码。**你电脑上有多个网卡地址，请选 `192.168.0.103`（WLAN 3）那张**，其余是 WSL / Tailscale / 蓝牙等，扫了连不上。
3. 手机和电脑要在同一个局域网（同一个 Wi-Fi）。配对凭据含令牌，二维码别外发；在电脑上点「撤销配对并生成新码」可以作废旧码。
4. 连上后电脑左下角会从「手机未连接」变成已连接。

## 七、手机上的权限和推荐设置

- 允许**通知**、**麦克风**、**相机**（扫码用）。
- 「⚙ 设置」页里点「精确提醒权限」把它打开；再点「应用与后台设置」，在 HyperOS 里允许**后台自启动**、把省电策略设为**无限制**。
- 点「中文离线播报」把中文离线语音包下好，回到 Qube 点「测试播报」确认能出声。
- 手机横屏使用（应用锁定横屏）。
- 想用唤醒词：点「开启唤醒词监听」，说「小机小机」，眼睛进入聆听状态后再说指令（例如「打开夜间模式」「明天下午三点提醒我开会」）。监听会常驻一条通知，可在应用里停止；**重启手机后要重新打开应用并开启监听**（提醒会自动恢复，不依赖麦克风）。
- 自定义唤醒词：设置里输入 2～6 个汉字 →「生成并试唤醒」→ 喊对了才能「确认保存」。这一步需要电脑语音服务可用。

## 八、常见问题

- **启动报 `does not provide an export named 'clipboard'`**：环境里有 `ELECTRON_RUN_AS_NODE=1`，清掉再启动，或用 `qube-start.ps1`。
- **手机装 APK 报 `INSTALL_FAILED_USER_RESTRICTED`**：HyperOS 拦了 USB 安装，改从手机文件管理点 APK 安装即可。
- **手机连不上电脑**：先确认同一 Wi-Fi；电脑上没有开防火墙（当前三档配置都是关闭的），如果以后开了防火墙，只需在**专用网络**允许 TCP 19431。
- **语音不识别**：设置里的 `pythonPath` 填错、模型不在缓存里、或 CUDA/cuDNN 缺失。先看「检查语音服务」返回的状态文字。
- **`npm run start` 失效**：不要直接用 `npm run start`，本环境会命中上面那条 Electron 环境变量问题，用 `qube-start.ps1`。
- **Windows 控件类功能（切歌、护眼开关、电脑状态）报错**：确认 `apps\windows\native\publish\Qube.Native.exe` 在（已编译），且目标软件版本暴露的控件名称与设置里一致。
- **这台手机上 `adb shell input` / `pm grant` 都不能用**：`INJECT_EVENTS` 和 `GRANT_RUNTIME_PERMISSIONS` 都被 HyperOS 挡住，权限和点击都得在手机界面上手动完成。

## 九、数据位置

| 数据 | 路径 |
| --- | --- |
| 电脑端用户数据（`qube.db`、`config.json`、`pairing.key`、`tls.pem`） | 源码模式：`%APPDATA%\@qube\windows`（安装包模式是 `%APPDATA%\Qube`，两者数据不互通） |
| 语音模型缓存 | `%USERPROFILE%\.cache\huggingface` |
| 语音 Python 环境 | `%LOCALAPPDATA%\Qube\speech-venv` |
| 本机为编译准备的工具链 | `D:\Qube-tools`（JDK 17、Android SDK、Gradle 8.11.1、.NET 8 SDK、adb） |
