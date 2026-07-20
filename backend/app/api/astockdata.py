"""a-stock-data 插件数据源 HTTP 接口 (Phase 3)。"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query

from app.data_providers.custom.loader import get_provider, is_builtin

router = APIRouter(prefix="/plugins/astockdata", tags=["a-stock-data"])


def _get_provider():
    """获取 astockdata provider, 不存在则抛 404."""
    try:
        return get_provider("astockdata")
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="a-stock-data 插件未启用或未安装")


@router.get("/money_flow")
def get_money_flow(
    date: str = Query(..., description="YYYY-MM-DD"),
    symbols: str = Query("", description="逗号分隔股票代码"),
    freq: str = Query("daily", description="daily 或 minute"),
):
    """获取个股主力资金流数据。"""
    provider = _get_provider()
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()] if symbols else []
    dt = datetime.strptime(date, "%Y-%m-%d")
    df = provider.get_money_flow(symbol_list, dt, freq=freq)
    return {
        "ok": True,
        "data": df.to_dicts() if df.height > 0 else [],
    }


@router.get("/limit_pool")
def get_limit_pool(
    date: str = Query(..., description="YYYY-MM-DD"),
    status: str = Query("limit_up", description="limit_up / limit_down / all"),
):
    """获取打板池数据。"""
    provider = _get_provider()
    dt = datetime.strptime(date, "%Y-%m-%d")
    df = provider.get_limit_pool(dt, status=status)
    return {
        "ok": True,
        "data": df.to_dicts() if df.height > 0 else [],
    }


@router.get("/north_bound")
def get_north_bound(
    date: str = Query(..., description="YYYY-MM-DD"),
):
    """获取北向资金数据。"""
    provider = _get_provider()
    dt = datetime.strptime(date, "%Y-%m-%d")
    df = provider.get_north_bound(dt)
    return {
        "ok": True,
        "data": df.to_dicts() if df.height > 0 else [],
    }


@router.get("/margin")
def get_margin(
    date: str = Query(..., description="YYYY-MM-DD"),
    symbols: str = Query("", description="逗号分隔股票代码"),
):
    """获取两融数据。"""
    provider = _get_provider()
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()] if symbols else []
    dt = datetime.strptime(date, "%Y-%m-%d")
    df = provider.get_margin(symbol_list, dt)
    return {
        "ok": True,
        "data": df.to_dicts() if df.height > 0 else [],
    }
