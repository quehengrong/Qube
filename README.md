# Qube

Redmi 桌面机器人助手：机械眼睛、中文语音控制、Codex / Claude CLI 听写和手机独立提醒。

目标设备：REDMI 15R 5G（HyperOS 2）与 Windows 11；WSL 为默认 CLI 环境。

## 开发

Node.js 22 LTS、npm；Android 需要 JDK 17 和 Android SDK；本地语音服务需要 Python 3.10–3.12。

```sh
npm ci
npm run check
npm test
npm run build
npm run dev
```

此仓库处于开发中。真实设备兼容性与构建状态见 [验收记录](docs/validation.md)。
