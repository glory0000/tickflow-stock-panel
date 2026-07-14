"""可用性检测函数。供 loader.py 的 _call_check() 调用。"""
from __future__ import annotations

import os

_ASTOCKDATA_PORT = int(os.getenv("ASTOCKDATA_PORT", "3030"))
_ASTOCKDATA_HOST = os.getenv("ASTOCKDATA_HOST", "127.0.0.1")


def availability() -> tuple[bool, str]:
    """探活: 返回 (是否可用, 原因)。"""
    try:
        import requests

        resp = requests.get(
            f"http://{_ASTOCKDATA_HOST}:{_ASTOCKDATA_PORT}/health",
            timeout=5,
        )
        if resp.ok and resp.json().get("ok"):
            ver = resp.json().get("version", "?")
            return True, f"ok (bridge {ver})"
        return False, f"bridge 返回异常: {resp.status_code}"
    except ImportError:
        return False, "requests 库未安装"
    except Exception as e:
        return False, f"Bridge 服务不可用: {e}"
