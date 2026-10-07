# Third-party assets

Qube uses sherpa-onnx 1.13.8 (Apache-2.0) and the upstream Chinese/English KWS model `sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20`. The build downloads the AAR and model from official GitHub releases; weights are not stored in this repository. Preserve the upstream license notices when distributing builds.

- https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.8/LICENSE
- https://github.com/k2-fsa/sherpa-onnx/releases/tag/kws-models
- https://github.com/SYSTRAN/faster-whisper (MIT)

Electron, xterm.js, node-pty and other package licenses are included in npm dependency metadata and packaged dependency files.

## 0.2 additions

- pypinyin 0.55.0 (MIT): local conversion of Chinese wake phrases into candidate phonemes; model token validation and on-phone wake testing remain mandatory.
- Node.js built-in SQLite: desktop drafts, durable submission receipts and action history; no additional native npm database binding.
- Codex App Server and Claude Code hooks: use the installed, authenticated CLIs. These adapters do not bundle either CLI or account credentials.
