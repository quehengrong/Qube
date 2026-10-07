# Qube 0.2.0 验收记录

日期：2026-10-07。代码版本：[d311252](https://github.com/quehengrong/Qube/commit/d311252)。

最终构建：[GitHub Actions #37591611167](https://github.com/quehengrong/Qube/actions/runs/37591611167)。core、windows、android 三个任务全部成功。

## 自动化验证

| 检查 | 结果与范围 |
| --- | --- |
| TypeScript 类型检查、桌面编译 | 本地通过；CI core 通过 |
| TypeScript 测试 | 25 项通过：原提醒/配对逻辑，分会话草稿、撤销重做、模糊替换拒绝、过期版本、并发编辑、持久化防重发、草稿恢复、场景部分失败与重试、SQLite 记录、Shell 引号、Codex 完成/失败/中断及授权输入 |
| Python 语音 API | 6 项通过：音频长度、鉴权、HTTP 错误、模拟识别以及中文唤醒词转换；没有使用真实 CUDA 模型 |
| 桌面 Playwright | 本地与最终 Windows CI 均通过：导航、项目配置、增强会话选项、撤销重做、无目标禁止发送、配对二维码、离线错误和 renderer 无脚本错误 |
| Android JVM | 7 项通过：3 项原提醒时间测试，4 项新增安静规则、单调时钟、重启恢复和暂停测试 |
| Android 发布构建与 lint | 最终 CI 通过固定签名发布构建与 lint |
| APK 签名 | 最终 APK 已由 apksigner 验证 v2 签名；固定证书 SHA-256 见下 |
| Windows 原生程序与 NSIS | 最终 CI 通过原生编译、NSIS 打包，以及打包后的增强界面启动检查 |

测试不连接真实 Codex/Claude 账号；Agent 测试使用受控 JSON-RPC 事件。没有把真实任务发送给用户的编程会话。

固定 Android 发布证书 SHA-256：

```text
781d4c4b30b991bd94daa93d9848888a05eef8fa97af59ef8b0b2a8a224291ce
```

CI 从加密 Secrets 恢复签名材料，源码不含私钥。Windows 安装包没有配置代码签名。

## 下载与摘要

- [Windows 11 x64 安装程序](https://github.com/quehengrong/Qube/actions/runs/37591611167/artifacts/11469480665)
- [Android arm64 固定签名 APK](https://github.com/quehengrong/Qube/actions/runs/37591611167/artifacts/11469002095)

```text
Windows artifact ZIP SHA-256:
153dfeae3de89aa66409be75c3f931c09c6d54e17681c05e571e51f82a3e844a
Android artifact ZIP SHA-256:
0dec2c07f081c7b16e013efcec2d58883e564688be28b1ac54d3f20e1f7af950
Android APK SHA-256:
bd1c0cd4985c7a77aac3487814341b59ced32668983c751570d88b11cc8bf10d
```

Android ZIP 已下载并核对摘要，APK 摘要与 CI 一致；包内有 3 个 ONNX 模型、5 个 ARM64 原生库及 2 个 DEX 文件。Windows ZIP 摘要来自 GitHub artifact 元数据，当前 macOS 未下载完整 Windows 包；打包后的 Qube.exe 已在 Windows CI 启动并通过界面测试，尚未在用户电脑运行 NSIS 安装向导。

GitHub artifact 下载需要登录，保存期限以仓库 Actions 设置为准。

## 12 项功能验收清单

| 功能 | 已实现与自动化证据 | 仍需用户设备验证 |
| --- | --- | --- |
| Agent 状态与提醒 | Codex 事件适配、Claude 独立 hooks、通知去重与合并；事件映射测试通过 | 两类 CLI × WSL/PowerShell，实际授权/提问和失败状态 |
| 语音编辑草稿 | 分会话编辑、纠正、预览、撤销重做；状态与界面测试通过 | 真实中文夹英文识别、连续口述纠错 |
| 工作场景 | 项目表单、启动/复用、歌单、休息；部分失败与重试测试通过 | 项目实际路径、编辑器参数、网易云控件 |
| 截图加入任务 | 窗口选择/绑定、缩略图、大小与摘要验证、WSL 路径处理 | 多屏、DPI、隐藏/受保护窗口、CLI 实际图片读取 |
| 灵感清单 | Room 本地存储、编辑/搜索/归档、转提醒与任务草稿 | 断网编辑、转任务回执和备份恢复 |
| 电脑状态 | Windows CPU/内存/进程采样、NVIDIA GPU 查询、缺失值提示 | RTX 4070 Ti 数据与系统工具核对 |
| 专注与休息 | 本地计时、暂停恢复、开机恢复；纯逻辑测试通过 | 锁屏、HyperOS 省电、重启、电脑关机后的实际提醒 |
| 选中/剪贴板助手 | 明确触发、UIA 选择、辅助会话隔离、结果确认 | 各应用 UIA 支持情况、现有 CLI 的辅助结果 |
| 摸头互动 | 单击/连击/800ms 长按、任务状态恢复、低帧率待机 | Redmi 触控、持续运行、发热与耗电 |
| 名称/声音/颜色/唤醒词 | 设置持久化、模型音素校验、试唤醒后确认；转换测试通过 | 中文离线 TTS、唤醒成功率和误唤醒率 |
| 播报强度 | 单一队列、重要优先、系统静音、专注/安静规则；规则测试通过 | 多提醒同时到期、麦克风与播报切换、不自唤醒 |
| 操作历史 | 两端事件 ID 合并、结果及会话记录、保留期、清空 | 断连重连、手机离线操作同步 |

## 数据升级

手机 Room v1→v2 使用显式迁移，增加提醒重要程度与 companion 表，不清空旧提醒。桌面首次导入旧草稿，保留原 JSON；之后使用 SQLite。

从旧 debug APK 切换到固定签名 release APK，需要先备份再迁移。已提供旧 debug 数据导出脚本和新版应用内导入/导出。此流程尚未在用户手机执行，不能声称用户现有数据已经迁移。操作见 [安装说明](setup.md#从-01-debug-apk-升级)。

## 未验证项目

当前工作站是 macOS，未连接用户的 REDMI 或 Windows 电脑。真实麦克风唤醒、CUDA 延迟、网易云与夜间模式 UIA、实际屏幕捕获、真实 CLI 任务、手机电源管理和安装向导均需实机验收。CPU 温度在当前通用接口下明确显示不支持。

前一版验收记录可从 Git 历史中的 `docs/validation.md` 查看。
