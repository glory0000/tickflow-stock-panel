"""Bridge 服务进程管理。负责启动/停止/探活 a-stock-data Bridge 服务。"""
from __future__ import annotations

import logging
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_ASTOCKDATA_PORT = int(os.getenv("ASTOCKDATA_PORT", "3030"))
_ASTOCKDATA_HOST = os.getenv("ASTOCKDATA_HOST", "127.0.0.1")


class AStockDataBridgeError(RuntimeError):
    """Bridge 服务调用失败。"""


class BridgeProcess:
    """管理 Bridge 服务子进程的生命周期。"""

    def __init__(self) -> None:
        self._proc: Optional[subprocess.Popen] = None

    def start(self, timeout: int = 15) -> None:
        """启动 Bridge 服务进程。"""
        if self._proc and self._proc.poll() is None:
            logger.info("Bridge 服务已在运行 (PID=%s)", self._proc.pid)
            return

        # 启动子进程
        self._proc = subprocess.Popen(
            [sys.executable, "-m", "app.plugins.astockdata.bridge_server"],
            cwd=str(Path(__file__).resolve().parents[3]),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        logger.info("Bridge 服务启动中 (PID=%s)", self._proc.pid)

        # 等待服务就绪
        self._wait_ready(timeout)

    def _wait_ready(self, timeout: int) -> None:
        """等待 Bridge 服务就绪。"""
        import requests

        deadline = time.time() + timeout
        while time.time() < deadline:
            if self._proc and self._proc.poll() is not None:
                raise AStockDataBridgeError(
                    f"Bridge 服务启动失败，进程已退出 (exit={self._proc.returncode})"
                )
            try:
                resp = requests.get(
                    f"http://{_ASTOCKDATA_HOST}:{_ASTOCKDATA_PORT}/health",
                    timeout=2,
                )
                if resp.ok:
                    logger.info("Bridge 服务就绪")
                    return
            except requests.RequestException:
                pass
            time.sleep(0.5)
        raise AStockDataBridgeError(f"Bridge 服务启动超时 ({timeout}s)")

    def stop(self) -> None:
        """停止 Bridge 服务进程。"""
        if self._proc and self._proc.poll() is None:
            self._proc.send_signal(signal.SIGTERM)
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()
                self._proc.wait()
            logger.info("Bridge 服务已停止")
        self._proc = None

    def is_alive(self) -> bool:
        """检查 Bridge 服务是否存活。"""
        if not self._proc or self._proc.poll() is not None:
            return False
        try:
            import requests

            resp = requests.get(
                f"http://{_ASTOCKDATA_HOST}:{_ASTOCKDATA_PORT}/health",
                timeout=2,
            )
            return resp.ok
        except Exception:
            return False


# 全局单例（进程级别）
_bridge_process: Optional[BridgeProcess] = None


def get_bridge_process() -> BridgeProcess:
    global _bridge_process
    if _bridge_process is None:
        _bridge_process = BridgeProcess()
    return _bridge_process


def run_job(job: dict, timeout: int = 60) -> dict:
    """供 provider.py 调用的便捷封装：确保 Bridge 运行，发起 HTTP 请求。"""
    bp = get_bridge_process()
    if not bp.is_alive():
        bp.start()
    import requests

    # job 格式: {op: "money_flow", date: "2026-07-11", symbols: [...], freq: "daily"}
    # 其他数据集支持: status(symbols for limit_pool), type (for north_bound)
    op = job.get("op")
    params: dict = {"date": job.get("date", "")}
    if job.get("symbols"):
        params["symbols"] = ",".join(job["symbols"])
    if job.get("freq"):
        params["freq"] = job["freq"]
    if job.get("status"):
        params["status"] = job["status"]
    if job.get("type"):
        params["type"] = job["type"]

    resp = requests.get(
        f"http://{_ASTOCKDATA_HOST}:{_ASTOCKDATA_PORT}/{op}",
        params=params,
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.json()
