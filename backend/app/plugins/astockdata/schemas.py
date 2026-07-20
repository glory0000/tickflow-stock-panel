"""Pydantic 请求/响应模型。"""
from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


# === money_flow ===
class MoneyFlowRow(BaseModel):
    symbol: str
    date: date
    minute: Optional[str] = None
    main_net_inflow: float = 0.0
    huge_net_inflow: float = 0.0
    big_net_inflow: float = 0.0
    mid_net_inflow: float = 0.0
    small_net_inflow: float = 0.0
    main_pct: float = 0.0
    close: float = 0.0
    volume: float = 0.0
    pct_change: float = 0.0


class MoneyFlowResponse(BaseModel):
    ok: bool
    data: list[MoneyFlowRow] = Field(default_factory=list)
    error: Optional[str] = None


# === limit_pool ===
class LimitPoolRow(BaseModel):
    date: date
    symbol: str
    name: str
    close: float = 0.0
    pct_change: float = 0.0
    turnover_rate: float = 0.0
    float_mv: float = 0.0
    limit_amount: float = 0.0
    break_rate: float = 0.0
    continuous_days: int = 0
    first_limit_time: Optional[str] = None
    status: str = "limit_up"  # limit_up / limit_down / normal


class LimitPoolResponse(BaseModel):
    ok: bool
    data: list[LimitPoolRow] = Field(default_factory=list)
    error: Optional[str] = None


# === north_bound ===
class NorthBoundRow(BaseModel):
    date: date
    type: str = "SH"  # SH / SZ / HSI / HSCEI
    name: str = ""
    net_inflow: float = 0.0
    buy_amount: float = 0.0
    sell_amount: float = 0.0
    quota_balance: float = 0.0
    quota_balance_pct: float = 0.0
    hold_amount: float = 0.0


class NorthBoundResponse(BaseModel):
    ok: bool
    data: list[NorthBoundRow] = Field(default_factory=list)
    error: Optional[str] = None


# === margin ===
class MarginRow(BaseModel):
    date: date
    symbol: str
    margin_balance: float = 0.0  # 融资余额
    margin_buy: float = 0.0  # 融资买入额
    margin_repay: float = 0.0  # 融资偿还额
    short_balance: float = 0.0  # 融券余额
    short_sell: float = 0.0  # 融券卖出量
    short_cover: float = 0.0  # 融券偿还量
    net_balance: float = 0.0  # 净融资余额
    margin_pct: float = 0.0  # 融资占流通市值比


class MarginResponse(BaseModel):
    ok: bool
    data: list[MarginRow] = Field(default_factory=list)
    error: Optional[str] = None


# === health ===
class HealthResponse(BaseModel):
    ok: bool
    version: str = "0.1.0"
    astockdata_version: str = "0.1.0"
    uptime_seconds: float = 0.0
