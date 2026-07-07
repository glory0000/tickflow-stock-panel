"""Dual-stack TCP launcher for uvicorn.

uvicorn 的 --fd 在 Windows 上无效(内部硬编码 AF_UNIX,见
uvicorn/config.py:556)。本脚本走另一条路:把预开的 dual-stack socket
直接通过 uvicorn.Config(socket=...) 传给 uvicorn。

注意: --reload + socket= 在 uvicorn 行为上不兼容(reload 子进程拿不到
我们的 socket)。本 launcher 默认不开 reload; 真要 reload 请用
uvicorn --reload 单独跑(走默认 IPV6_V6ONLY,本机/loopback 可访问)。

用法:
  uv run python scripts/dual_bind.py 3018 app.main:app
"""
from __future__ import annotations

import socket
import sys


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: dual_bind.py <port> <uvicorn-app-target>", file=sys.stderr)
        return 2

    port = int(sys.argv[1])
    app_target = sys.argv[2]

    sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
    except OSError as e:
        print(f"warn: cannot set IPV6_V6ONLY=0: {e}", file=sys.stderr)
    sock.bind(("::", port))
    sock.listen(128)
    print(f"[dual_bind] dual-stack listening on ::{port}", file=sys.stderr)

    import asyncio
    import uvicorn

    # Windows 默认走 ProactorEventLoop; 强制用 SelectorEventLoop + Selector
    # 直接 accept,避免 Proactor/IOCP 在某些情况下处理 IPv4-mapped IPv6 时的怪异行为。
    loop = asyncio.SelectorEventLoop()
    asyncio.set_event_loop(loop)

    config = uvicorn.Config(
        app_target,
        host="::",
        port=port,
        log_level="info",
        loop="asyncio",
    )
    server = uvicorn.Server(config)
    config.setup_event_loop()
    server.run(sockets=[sock])
    return 0


if __name__ == "__main__":
    sys.exit(main())
