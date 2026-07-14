"""a-stock-data Bridge 服务。独立进程，端口 3030。"""
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Query
import requests
import uvicorn

from app.plugins.astockdata.schemas import (
    HealthResponse,
    LimitPoolResponse,
    LimitPoolRow,
    MarginResponse,
    MarginRow,
    MoneyFlowResponse,
    MoneyFlowRow,
    NorthBoundResponse,
    NorthBoundRow,
)

logger = logging.getLogger(__name__)

_ASTOCKDATA_PORT = int(os.getenv("ASTOCKDATA_PORT", "3030"))
_ASTOCKDATA_HOST = os.getenv("ASTOCKDATA_HOST", "127.0.0.1")
_START_TIME = time.time()

# Eastmoney API endpoints
_EM_DAILY_FLOW_URL = "https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get"
_EM_MINUTE_FLOW_URL = "https://push2.eastmoney.com/api/qt/stock/fflow/kline/get"
_EM_LIMIT_POOL_URL = "https://push2ex.eastmoney.com/api/qt/stock/getTopicPool"
_EM_NORTH_BOUND_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get"
_EM_MARGIN_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get"

# 请求间隔（秒），防止触发限流
_EM_MIN_INTERVAL = 1.5


def _em_get(url: str, params: dict, timeout: int = 30) -> dict:
    """调用东财 API，带简单限流。"""
    time.sleep(_EM_MIN_INTERVAL)
    resp = requests.get(url, params=params, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _parse_symbol(code: str) -> str:
    """将标准代码(如 000001.SZ)转换为东财格式(如 000001)。"""
    return code.replace(".SZ", "").replace(".SH", "")


# === money_flow ===
def _get_daily_money_flow(symbol: Optional[str] = None, days: int = 120) -> list[MoneyFlowRow]:
    """获取日级资金流（120日）。"""
    params = {
        "lmt": days,
        "klt": 101,
        "secid": f"1.{_parse_symbol(symbol)}" if symbol else "",
        "fields1": "f1,f2,f3,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18",
        "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f62,f63,f64,f65",
    }
    try:
        data = _em_get(_EM_DAILY_FLOW_URL, params)
    except Exception as e:
        logger.error("获取日级资金流失败: %s", e)
        return []

    klines = data.get("data", {}).get("klines", [])
    rows = []
    for kline in klines:
        parts = kline.split(",")
        if len(parts) < 8:
            continue
        try:
            close = float(parts[1]) if parts[1] else 0.0
            volume = float(parts[8]) if parts[8] else 0.0
            main_net = float(parts[3]) if parts[3] else 0.0
            rows.append(
                MoneyFlowRow(
                    symbol=symbol or "",
                    date=parts[0],
                    minute=None,
                    main_net_inflow=main_net,
                    huge_net_inflow=float(parts[4]) if parts[4] else 0.0,
                    big_net_inflow=float(parts[5]) if parts[5] else 0.0,
                    mid_net_inflow=float(parts[6]) if parts[6] else 0.0,
                    small_net_inflow=float(parts[7]) if parts[7] else 0.0,
                    main_pct=main_net / (close * volume / 10000) if close and volume else 0.0,
                    close=close,
                    volume=volume,
                    pct_change=float(parts[2]) / 100 if parts[2] else 0.0,
                )
            )
        except (ValueError, IndexError):
            continue
    return rows


def _get_minute_money_flow(symbol: str) -> list[MoneyFlowRow]:
    """获取分钟级资金流。"""
    params = {
        "secid": f"1.{_parse_symbol(symbol)}",
        "klt": 1,
        "fields1": "f1,f2,f3,f7,f8,f9,f10,f12,f13,f14",
        "fields2": "f51,f52,f53,f54,f55,f56,f57,f58",
    }
    try:
        data = _em_get(_EM_MINUTE_FLOW_URL, params)
    except Exception as e:
        logger.error("获取分钟资金流失败: %s", e)
        return []

    klines = data.get("data", {}).get("klines", [])
    rows = []
    for kline in klines:
        parts = kline.split(",")
        if len(parts) < 7:
            continue
        try:
            rows.append(
                MoneyFlowRow(
                    symbol=symbol,
                    date=parts[0],
                    minute=parts[0].split(" ")[1] if " " in parts[0] else parts[0],
                    main_net_inflow=float(parts[3]) if parts[3] else 0.0,
                    huge_net_inflow=0.0,
                    big_net_inflow=0.0,
                    mid_net_inflow=0.0,
                    small_net_inflow=0.0,
                    main_pct=0.0,
                    close=float(parts[1]) if parts[1] else 0.0,
                    volume=float(parts[5]) if parts[5] else 0.0,
                    pct_change=float(parts[2]) / 100 if parts[2] else 0.0,
                )
            )
        except (ValueError, IndexError):
            continue
    return rows


# === limit_pool ===
def _get_limit_pool(date: str, status: str = "limit_up") -> list[LimitPoolRow]:
    """获取打板池数据。"""
    params = {
        "ut": "7eea3edcaed734bea9cbfc24409ed989",
        "fltt": "2",
        "invt": "2",
        "dect": "2",
        "wtdc": "2",
        "tid": "0",
        "pn": "0",
        "np": "1",
        "type": "1" if status == "limit_up" else "2" if status == "limit_down" else "0",
        "_": str(int(time.time() * 1000)),
    }
    try:
        data = _em_get(_EM_LIMIT_POOL_URL, params)
    except Exception as e:
        logger.error("获取打板池失败: %s", e)
        return []

    rows = []
    for item in data.get("data", {}).get("diff", []):
        try:
            rows.append(
                LimitPoolRow(
                    date=date,
                    symbol=str(item.get("c", "")),
                    name=str(item.get("n", "")),
                    close=float(item.get("p", 0)) or 0.0,
                    pct_change=float(item.get("zdp", 0)) / 100 or 0.0,
                    turnover_rate=float(item.get("hs", 0)) / 100 or 0.0 if status == "limit_up" else 0.0,
                    float_mv=float(item.get("lbc", 0)) or 0.0,
                    limit_amount=float(item.get("dmx", 0)) or 0.0,
                    break_rate=float(item.get("zbc", 0)) / 100 or 0.0 if status == "limit_up" else 0.0,
                    continuous_days=int(item.get("lb", 0)) or 0,
                    first_limit_time=None,
                    status="limit_up" if status == "limit_up" else "limit_down",
                )
            )
        except (ValueError, TypeError):
            continue
    return rows


# === north_bound ===
def _get_north_bound(date: str) -> list[NorthBoundRow]:
    """获取北向资金数据。"""
    params = {
        "sortColumns": "TRADE_DATE",
        "sortTypes": "-1",
        "pageSize": "50",
        "pageNumber": "1",
        "reportName": "RPT_MUTUAL_FUND_SH",
        "columns": "ALL",
        "filter": f"(TRADE_DATE>='{date}')(TRADE_DATE<='{date}')",
    }
    try:
        data = _em_get(_EM_NORTH_BOUND_URL, params)
    except Exception as e:
        logger.error("获取北向资金失败: %s", e)
        return []

    rows = []
    for item in data.get("result", {}).get("data", []):
        try:
            rows.append(
                NorthBoundRow(
                    date=str(item.get("TRADE_DATE", date)),
                    type="SH",
                    name="沪股通",
                    net_inflow=float(item.get("HGT_CONCERN_NET_BUY", 0)) or 0.0,
                    buy_amount=float(item.get("HGT_SH_BUY_AMT", 0)) or 0.0,
                    sell_amount=float(item.get("HGT_SH_SELL_AMT", 0)) or 0.0,
                    quota_balance=float(item.get("HGT_SH_QUOTA_BALANCE", 0)) or 0.0,
                    quota_balance_pct=float(item.get("HGT_SH_QUOTA_RATIO", 0)) / 100 or 0.0,
                    hold_amount=float(item.get("HGT_SH_HOLD_AMT", 0)) or 0.0,
                )
            )
        except (ValueError, TypeError):
            continue
    return rows


# === margin ===
def _get_margin(date: str, symbol: Optional[str] = None) -> list[MarginRow]:
    """获取两融数据。"""
    filter_parts = [f"(TRADE_DATE>='{date}')(TRADE_DATE<='{date}')"]
    if symbol:
        filter_parts.append(f"(SECUCODE='{symbol}')")
    params = {
        "sortColumns": "TRADE_DATE",
        "sortTypes": "-1",
        "pageSize": "100",
        "pageNumber": "1",
        "reportName": "RPT_MARGINS_DETAIL",
        "columns": "ALL",
        "filter": "".join(filter_parts),
    }
    try:
        data = _em_get(_EM_MARGIN_URL, params)
    except Exception as e:
        logger.error("获取两融数据失败: %s", e)
        return []

    rows = []
    for item in data.get("result", {}).get("data", []):
        try:
            rows.append(
                MarginRow(
                    date=str(item.get("TRADE_DATE", date)),
                    symbol=str(item.get("SECUCODE", "")),
                    margin_balance=float(item.get("RZYE", 0)) or 0.0,
                    margin_buy=float(item.get("ZRZYE", 0)) or 0.0,
                    margin_repay=float(item.get("ZRZDFHB", 0)) or 0.0,
                    short_balance=float(item.get("RQYE", 0)) or 0.0,
                    short_sell=float(item.get("RQMRE", 0)) or 0.0,
                    short_cover=float(item.get("RQDFHH", 0)) or 0.0,
                    net_balance=float(item.get("RZYE", 0)) or 0.0,
                    margin_pct=0.0,
                )
            )
        except (ValueError, TypeError):
            continue
    return rows


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("a-stock-data Bridge 启动，监听 %s:%s", _ASTOCKDATA_HOST, _ASTOCKDATA_PORT)
    yield
    logger.info("a-stock-data Bridge 关闭")


app = FastAPI(title="a-stock-data Bridge", lifespan=lifespan)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        ok=True,
        version="0.2.0",
        astockdata_version="0.2.0",
        uptime_seconds=time.time() - _START_TIME,
    )


@app.get("/money_flow", response_model=MoneyFlowResponse)
def get_money_flow(
    date: str = Query(..., description="YYYY-MM-DD"),
    symbols: Optional[str] = Query(None, description="逗号分隔股票代码，不传则返回全市场"),
    freq: str = Query("daily", description="daily 或 minute"),
) -> MoneyFlowResponse:
    """获取个股资金流数据。"""
    try:
        if freq == "minute":
            code = symbols.split(",")[0] if symbols else "000001.SZ"
            rows = _get_minute_money_flow(code)
        else:
            code = symbols.split(",")[0] if symbols else None
            rows = _get_daily_money_flow(code)
        return MoneyFlowResponse(ok=True, data=rows)
    except Exception as e:
        logger.error("money_flow 获取失败: %s", e)
        return MoneyFlowResponse(ok=False, data=[], error=str(e))


@app.get("/limit_pool", response_model=LimitPoolResponse)
def get_limit_pool(
    date: str = Query(..., description="YYYY-MM-DD"),
    status: str = Query("limit_up", description="limit_up / limit_down / all"),
) -> LimitPoolResponse:
    """获取打板池数据。"""
    try:
        rows = _get_limit_pool(date, status)
        return LimitPoolResponse(ok=True, data=rows)
    except Exception as e:
        logger.error("limit_pool 获取失败: %s", e)
        return LimitPoolResponse(ok=False, data=[], error=str(e))


@app.get("/north_bound", response_model=NorthBoundResponse)
def get_north_bound(
    date: str = Query(..., description="YYYY-MM-DD"),
) -> NorthBoundResponse:
    """获取北向资金数据。"""
    try:
        rows = _get_north_bound(date)
        return NorthBoundResponse(ok=True, data=rows)
    except Exception as e:
        logger.error("north_bound 获取失败: %s", e)
        return NorthBoundResponse(ok=False, data=[], error=str(e))


@app.get("/margin", response_model=MarginResponse)
def get_margin(
    date: str = Query(..., description="YYYY-MM-DD"),
    symbols: Optional[str] = Query(None, description="逗号分隔股票代码"),
) -> MarginResponse:
    """获取两融数据。"""
    try:
        code = symbols.split(",")[0] if symbols else None
        rows = _get_margin(date, code)
        return MarginResponse(ok=True, data=rows)
    except Exception as e:
        logger.error("margin 获取失败: %s", e)
        return MarginResponse(ok=False, data=[], error=str(e))


def run_server() -> None:
    uvicorn.run(app, host=_ASTOCKDATA_HOST, port=_ASTOCKDATA_PORT, log_level="info")


if __name__ == "__main__":
    run_server()
