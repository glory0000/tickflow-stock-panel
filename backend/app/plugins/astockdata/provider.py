"""a-stock-data 数据源 Provider。注入 loader._PROVIDERS 注册表。"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import polars as pl

from app.plugins.astockdata import bridge

logger = logging.getLogger(__name__)

# 本 Provider 支持的数据集
_DATASETS = ("money_flow", "limit_pool", "north_bound", "margin")


@dataclass
class _AStockDataConfig:
    """轻量 config shim。"""

    name: str = "astockdata"
    display_name: str = "a-stock-data（资金流/打板/北向/两融）"
    datasets: dict = field(default_factory=lambda: dict.fromkeys(_DATASETS))
    path: Optional[str] = None
    builtin: bool = True


class AStockDataProvider:
    """a-stock-data 数据源。"""

    name = "astockdata"
    builtin = True

    def __init__(self) -> None:
        self.config = _AStockDataConfig()
        self._enabled = os.getenv("ASTOCKDATA_ENABLED", "true").lower() != "false"

    def close(self) -> None:
        pass

    # ---- money_flow ----
    def get_money_flow(
        self,
        symbols: list[str],
        date: datetime,
        freq: str = "daily",
    ) -> pl.DataFrame:
        """获取资金流数据。返回 polars DataFrame，字段契约见 spec。"""
        if not self._enabled:
            logger.warning("[astockdata] money_flow 已被禁用，返回空数据")
            return pl.DataFrame()

        date_str = date.strftime("%Y-%m-%d")
        logger.info(
            "[astockdata] money_flow 请求开始 date=%s symbols=%d freq=%s",
            date_str,
            len(symbols),
            freq,
        )

        try:
            result = bridge.run_job(
                {
                    "op": "money_flow",
                    "date": date_str,
                    "symbols": symbols,
                    "freq": freq,
                },
                timeout=60,
            )
            if not result.get("ok"):
                logger.warning("[astockdata] money_flow 返回错误: %s", result.get("error"))
                return pl.DataFrame()

            rows = result.get("data") or []
            if not rows:
                return pl.DataFrame()

            return self._rows_to_df(rows)

        except Exception as e:
            logger.warning("[astockdata] money_flow 请求异常: %s", e)
            return pl.DataFrame()

    # ---- limit_pool ----
    def get_limit_pool(
        self,
        date: datetime,
        status: str = "limit_up",
    ) -> pl.DataFrame:
        """获取打板池数据。返回 polars DataFrame。"""
        if not self._enabled:
            logger.warning("[astockdata] limit_pool 已被禁用，返回空数据")
            return pl.DataFrame()

        date_str = date.strftime("%Y-%m-%d")
        logger.info("[astockdata] limit_pool 请求开始 date=%s status=%s", date_str, status)

        try:
            result = bridge.run_job(
                {"op": "limit_pool", "date": date_str, "status": status},
                timeout=60,
            )
            if not result.get("ok"):
                logger.warning("[astockdata] limit_pool 返回错误: %s", result.get("error"))
                return pl.DataFrame()

            rows = result.get("data") or []
            if not rows:
                return pl.DataFrame()

            return self._rows_to_df(rows)

        except Exception as e:
            logger.warning("[astockdata] limit_pool 请求异常: %s", e)
            return pl.DataFrame()

    # ---- north_bound ----
    def get_north_bound(
        self,
        date: datetime,
    ) -> pl.DataFrame:
        """获取北向资金数据。返回 polars DataFrame。"""
        if not self._enabled:
            logger.warning("[astockdata] north_bound 已被禁用，返回空数据")
            return pl.DataFrame()

        date_str = date.strftime("%Y-%m-%d")
        logger.info("[astockdata] north_bound 请求开始 date=%s", date_str)

        try:
            result = bridge.run_job(
                {"op": "north_bound", "date": date_str},
                timeout=60,
            )
            if not result.get("ok"):
                logger.warning("[astockdata] north_bound 返回错误: %s", result.get("error"))
                return pl.DataFrame()

            rows = result.get("data") or []
            if not rows:
                return pl.DataFrame()

            return self._rows_to_df(rows)

        except Exception as e:
            logger.warning("[astockdata] north_bound 请求异常: %s", e)
            return pl.DataFrame()

    # ---- margin ----
    def get_margin(
        self,
        symbols: list[str],
        date: datetime,
    ) -> pl.DataFrame:
        """获取两融数据。返回 polars DataFrame。"""
        if not self._enabled:
            logger.warning("[astockdata] margin 已被禁用，返回空数据")
            return pl.DataFrame()

        date_str = date.strftime("%Y-%m-%d")
        logger.info("[astockdata] margin 请求开始 date=%s symbols=%d", date_str, len(symbols))

        try:
            result = bridge.run_job(
                {"op": "margin", "date": date_str, "symbols": symbols},
                timeout=60,
            )
            if not result.get("ok"):
                logger.warning("[astockdata] margin 返回错误: %s", result.get("error"))
                return pl.DataFrame()

            rows = result.get("data") or []
            if not rows:
                return pl.DataFrame()

            return self._rows_to_df(rows)

        except Exception as e:
            logger.warning("[astockdata] margin 请求异常: %s", e)
            return pl.DataFrame()

    def _rows_to_df(self, rows: list[dict]) -> pl.DataFrame:
        """将 rows 列表转换为 polars DataFrame，自动处理日期类型。"""
        import pandas as pd

        df = pl.DataFrame(rows)
        # 处理 date 字段（可能是字符串或 date 对象）
        if "date" in df.columns:
            df = df.with_columns(
                pl.col("date").cast(str).str.to_date("%Y-%m-%d", strict=False)
            )
        # 数值字段转换
        float_cols = [
            "main_net_inflow", "huge_net_inflow", "big_net_inflow",
            "mid_net_inflow", "small_net_inflow", "main_pct",
            "close", "volume", "pct_change", "turnover_rate",
            "float_mv", "limit_amount", "break_rate",
            "net_inflow", "buy_amount", "sell_amount",
            "quota_balance", "quota_balance_pct", "hold_amount",
            "margin_balance", "margin_buy", "margin_repay",
            "short_balance", "short_sell", "short_cover",
            "net_balance", "margin_pct",
        ]
        for col in float_cols:
            if col in df.columns:
                df = df.with_columns(pl.col(col).cast(pl.Float64, strict=False))
        return df

    # ---- 测试(设置页试拉) ----
    def test_dataset(self, dataset: str, symbols: Optional[list[str]] = None) -> dict:
        symbols = symbols or ["000001.SZ"]
        now = datetime.now()
        if dataset == "money_flow":
            df = self.get_money_flow(symbols, now, freq="daily")
            return _preview("money_flow", df)
        if dataset == "limit_pool":
            df = self.get_limit_pool(now, status="limit_up")
            return _preview("limit_pool", df)
        if dataset == "north_bound":
            df = self.get_north_bound(now)
            return _preview("north_bound", df)
        if dataset == "margin":
            df = self.get_margin(symbols, now)
            return _preview("margin", df)
        raise ValueError(f"astockdata 不支持数据集: {dataset}")


def _preview(dataset: str, df: pl.DataFrame) -> dict:
    return {
        "provider": "astockdata",
        "dataset": dataset,
        "rows": df.height,
        "columns": df.columns,
        "preview": df.head(5).to_dicts() if not df.is_empty() else [],
    }
