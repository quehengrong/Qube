"""按需把 NVIDIA 的 CUDA 运行库目录注册给 Windows 加载器。

ctranslate2 在加载 CUDA 后端时依赖 cublas64_12.dll / cudnn*_9.dll；这些库由 pip 轮子
（nvidia-cublas-cu12、nvidia-cudnn-cu12）提供在虚拟环境的 nvidia/*/bin 下，但不在
Windows 的默认搜索路径里。faster-whisper 在首次识别时才会加载它们，顺序不可控，所以
必须在解释器启动阶段就注册好：本文件由 sitecustomize 机制自动导入（PYTHONPATH 指向
services/speech），比 site-packages 里的 .pth 更可靠。

没有安装这些轮子时什么也不做，不改变纯 CPU 的用法。
"""
import glob
import os
import site
import sys

_handles = []


def _register() -> list[str]:
    candidates = []
    for root in site.getsitepackages() + [site.getusersitepackages()]:
        candidates.extend(glob.glob(os.path.join(root, "nvidia", "*", "bin")))
    added = []
    for directory in sorted(set(candidates)):
        if not os.path.isdir(directory):
            continue
        try:
            _handles.append(os.add_dll_directory(directory))
        except (AttributeError, OSError):
            pass
        path = os.environ.get("PATH", "")
        if directory not in path.split(os.pathsep):
            os.environ["PATH"] = directory + os.pathsep + path
        added.append(directory)
    return added


_registered = _register()
if _registered and os.environ.get("QUBE_SPEECH_DLL_DEBUG"):
    print(f"Qube speech: registered {len(_registered)} CUDA library dirs", file=sys.stderr)
