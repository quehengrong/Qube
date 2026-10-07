# Qube

[![Build](https://github.com/quehengrong/Qube/actions/workflows/build.yml/badge.svg)](https://github.com/quehengrong/Qube/actions/workflows/build.yml)

把 Redmi 变成有表情的桌面语音伙伴：喊“小机小机”，控制 Windows、向 Codex / Claude CLI 听写，或创建电脑关机后仍会提醒的备忘。

![Qube desktop](docs/screenshots/desktop.png)

## 安装预览版

从 [GitHub Actions 构建记录](https://github.com/quehengrong/Qube/actions/workflows/build.yml) 的成功运行中下载：

- [**Qube-Windows-x64-preview**](https://github.com/quehengrong/Qube/actions/workflows/build.yml)：Windows 11 安装程序。
- [**Qube-Android-arm64-preview**](https://github.com/quehengrong/Qube/actions/workflows/build.yml)：Redmi 可安装的固定发布签名 APK。旧 debug 版先按 [迁移说明](docs/setup.md#从-01-debug-apk-升级) 导出数据。

按 [安装与使用说明](docs/setup.md) 配置本地语音环境、手机权限和扫码配对。模型下载需要联网；正常语音处理在本地完成。实际 Redmi / Windows 软件版本仍需完成 [设备验收](docs/validation.md)。

## Qube 0.2 包含

- 机械眼睛、摸头互动、自定义名称/颜色/离线声音，试唤醒成功后更换中文唤醒词。
- 加密局域网配对，证书指纹固定、令牌鉴权及断线重连。
- WSL / PowerShell 托管 Codex 和 Claude 会话，结构化工作状态与完成/授权提醒。
- 分会话草稿、语音纠正、撤销重做、窗口截图、选中文字/剪贴板解释与翻译，确认后发送。
- 工作与休息场景、电脑资源状态、两端操作历史。
- 手机本地灵感清单、专注/休息计时、统一播报及安静模式。
- 软件启动、网易云控件适配、Windows 护眼暖色开关。具体控件需匹配安装版本，不支持时明确报错。
- 手机本地提醒清单、提前提醒、单次／每天／每周重复、通知操作和重启恢复。

手机：REDMI 15R 5G / HyperOS 2；电脑：Windows 11，推荐使用用户现有 RTX 4070 Ti 承担识别。电脑离线时，手机保留动画与提醒，并可手动管理提醒、灵感和专注计时。详见 [12 项增强功能及语音指令](docs/enhancements.md)。

## 开发

Node.js 22 LTS、npm；Android 需要 JDK 17、SDK 35 和 Gradle 8.11.1；语音服务需要 Python 3.10–3.12（安装脚本使用 3.11）。

```sh
npm ci
npm run build -w @qube/protocol
npm run check
npm test
npm run build
npm run dev
```

```text
apps/android        Kotlin / Compose 手机应用
apps/windows        Electron 桌面与 C# Windows 控件适配
services/speech     本地 faster-whisper HTTP 服务
packages/protocol   消息校验、提醒时间解析、草稿状态管理
scripts             构建资源准备
docs                安装、协议与验收记录
```

详见 [构建步骤](docs/setup.md#从源码构建)、[通信协议](docs/protocol.md)、[第三方组件](docs/third-party.md)。不要提交模型、录音、个人提醒数据或凭据。每笔代码提交都推送到本仓库；安装包由 CI 作为构建产物提供。
