# CLAUDE.md

A 股自托管量化工作台。FastAPI + Polars/DuckDB + React 18 + Vite + TS + Tailwind。

## 开发分支

**只在 `feature` 分支修改代码，不用 worktree。** 多人协作或需隔离实验时通过 `git stash` 暂存改动。

## 启动

```bash
cp .env.example .env        # 填 TICKFLOW_API_KEY
.\dev.ps1                   # Windows; Linux/Mac 用 ./dev.sh
# 后端 http://localhost:3018，前端 http://localhost:3011
```

## 常用命令

```bash
# 后端
cd backend && uv sync --extra backtest
uv run uvicorn app.main:app --reload --port 3018

# 前端
cd frontend && pnpm dev

# Lint / 构建
cd frontend && pnpm build

# 测试
cd backend && uv run pytest
```

## 架构要点

- **数据层**: Polars(向量化) + DuckDB(SQL join) + Parquet(列存落盘)
- **pandas** 仅在 `BacktestService` 边界使用，不向其他模块扩散
- **策略沙箱**: AI/用户自定义策略只允许 `import polars as pl`，`ai_generator.py` 用 `ast` 校验
- **文件落点**:
  - 内置策略 → `backend/app/strategy/builtin/`
  - 自定义策略 → `data/strategies/custom/`
  - AI 生成策略 → `data/strategies/ai/`
- **Docker**: `DATA_DIR` 必须用 `/app/data` 绝对路径

## 路径约定

- `data/` 整个目录 gitignore，存放用户数据和运行时文件
- `.env` 不提交（已 gitignore），参考 `.env.example`

## 详细文档

| 文档 | 用途 |
|---|---|
| `README.md` | 功能矩阵、快速开始 |
| `docs/deployment.md` | Docker / Dev / GH Actions 部署 |
| `docs/configuration.md` | `.env` 配置项详解 |
| `docs/features.md` | 7 大功能模块说明 |
| `docs/strategy.md` | 内置策略 + 扩展方式 |

## 运维警告

升级时**绝对不要** `git clean -fdx` / `git reset --hard` / 删项目重 clone — 会删光 `data/`。
`git pull` 报冲突时先 `git stash` 暂存。
