# Qube 0.1.0 预览版验收记录

日期：2026-10-07。代码版本：[b85c967](https://github.com/quehengrong/Qube/commit/b85c9672610ebc054a06b9854b83a7e96f4ab8d0)。

完整构建：[GitHub Actions #37582686424](https://github.com/quehengrong/Qube/actions/runs/37582686424)，core、windows、android 全部通过。

## 已完成的自动化验证

| 检查 | 结果 |
| --- | --- |
| TypeScript 类型检查与桌面编译 | 通过 |
| TypeScript 单元／集成测试 | 11 项通过：中文日期、正文保留、草稿版本、目标切换、并发发送、失败保留、请求去重、TLS 配对及错误令牌拒绝 |
| Python 音频及 HTTP 服务测试 | 5 项通过：鉴权、帧长度、大小限制、转写响应、模型错误路径；使用替代模型，不代表真实 ASR 效果 |
| Android Gradle 编译与 lint | 通过 |
| Android JVM 提醒时间测试 | 3 项通过 |
| Android APK | 已生成；下载后的产物 SHA-256 与 GitHub 摘要一致，已检查模型、原生库及 DEX 存在 |
| Windows .NET 原生适配器 | 编译、发布通过 |
| Windows NSIS 安装程序 | 构建通过 |
| 桌面 Playwright 冒烟 | macOS 源码启动与 Windows 打包后的 Qube.exe 均通过：导航、二维码、发送禁用、离线错误处理，无 renderer 脚本错误 |
| npm 运行时依赖审计 | 0 个已知漏洞；构建工具依赖另有 8 个 moderate 审计条目，未使用 force 降级打包工具 |

## 下载

- [Windows x64 安装包](https://github.com/quehengrong/Qube/actions/runs/37582686424/artifacts/11465751249)
- [Android arm64 APK](https://github.com/quehengrong/Qube/actions/runs/37582686424/artifacts/11464924568)

GitHub artifact 下载需要登录，保存期限以仓库 Actions 设置为准；源码可重新构建。安装包未做正式代码签名，Android 使用 debug 签名。

产物摘要：

```text
Windows artifact ZIP SHA-256:
ac257bd6ec3b2f230165345255143aef7f44954abd6b0de461b3835b87fe11e7
Android artifact ZIP SHA-256:
120c664424b5ade5454410b2043effdffbceaf1fe5e9e3e484af6ba4e92c4998
Android APK SHA-256:
05d705f191dccc36f54e3dcd1c97299254419a27254c2cbf994ed3a5fdb18260
```

Windows artifact 摘要来自 GitHub 元数据，未在当前 macOS 下载完整 Windows 安装包；打包程序已在 Windows CI 启动验证。没有实际运行 NSIS 安装向导。

## 必须在用户设备继续验证

当前开发环境是 macOS，没有连接真实 REDMI 或用户的 Windows 桌面。以下均为待验收，不能将编译或模拟测试视为通过：

- HyperOS 后台与熄屏唤醒、音乐干扰、播报不自唤醒、八小时运行。
- 唤醒二十次至少十八次成功，以及真实误唤醒率。
- 手机锁屏、断网、电脑关机、重启后提醒恢复和权限撤销；多个提醒在省电模式中的实际准点性。
- 真实 WSL / PowerShell 中 Codex 和 Claude 的中文、多行括号粘贴、确认发送和运行中交互；程序不自动判断 agent 是否处于输入提示符。
- 网易云当前客户端暴露的控件名称、每日推荐和收藏歌单页面。找不到、重名或不可读取状态时应明确失败；切歌只确认按钮操作。
- Windows 护眼暖色开关在用户系统版本与语言中的 TogglePattern。
- RTX 4070 Ti 上 CUDA / cuDNN、真实中文夹英文识别、显存占用和说完后三秒内转写目标。
- Redmi 上离线中文 TTS 资源是否安装及语音播报实际效果。

初次设置和诊断见 [安装说明](setup.md)。
