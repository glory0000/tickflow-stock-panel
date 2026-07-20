# a-stock-data 后续增强实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成三项增强：监控规则嵌入页面、资金流气泡图、打板池排序分组

**Architecture:** 监控菜单用 React 浮层组件；气泡图用 Canvas 2D 自研物理引擎；打板池复用 TierGroup 分组模式；后端规则引擎扩展 `_evaluate_rule` 分支

**Tech Stack:** Canvas 2D 物理引擎 / framer-motion / Polars DataFrame 阈值比较

---

## Global Constraints

- 气泡物理引擎：最大 200 气泡，每帧 O(n²) 碰撞检测
- 气泡颜色：红色=流入（正），绿色=流出（负）
- 地面边界 y = canvas.height - 40px，天空边界 y = height × 0.15
- 重力 0.08px/frame²，浮力 0.06px/frame²，阻力 0.98
- 打板池排序：同连板组内按封单额降序 + 封板时间早优先
- 连板数分组显示在同一区块内，可各自折叠

---

## 任务分解

---

### Task 1: 通用 MonitorMenu 浮层组件

**Files:**
- Create: `frontend/src/components/MonitorMenu.tsx`
- Test: `frontend/src/components/__tests__/MonitorMenu.test.tsx`（如已有类似测试可参考）

**Interfaces:**
- Consumes: `stock: {symbol, name}`，`direction: 'up'|'down'`（可选），`onClose()`
- Produces: `MonitorMenu` React 组件，调用 `api.monitorRuleSave()`

**前置:** 无

---

### Task 2: 北向资金页增加 MonitorMenu

**Files:**
- Modify: `frontend/src/pages/NorthBoundPage.tsx`
- Modify: `frontend/src/components/MonitorMenu.tsx`（继承 Task 1）

**Interfaces:**
- Consumes: `NorthBoundRow` 数据，`MonitorMenu` 组件
- Produces: NorthBoundPage 每行右侧有监控按钮

**前置:** Task 1 完成

---

### Task 3: 两融数据页增加 MonitorMenu

**Files:**
- Modify: `frontend/src/pages/MarginPage.tsx`
- Modify: `frontend/src/components/MonitorMenu.tsx`（继承 Task 1）

**Interfaces:**
- Consumes: `MarginRow` 数据，`MonitorMenu` 组件
- Produces: MarginPage 每行右侧有监控按钮

**前置:** Task 1 完成

---

### Task 4: 气泡图画布组件 BubbleCanvas

**Files:**
- Create: `frontend/src/components/BubbleCanvas.tsx`
- Create: `frontend/src/components/__tests__/BubbleCanvas.test.tsx`
- Type: 纯测试文件

**Interfaces:**
- Consumes: `bubbles: BubbleData[]`，`paused: boolean`，`speed: number`
- Produces: Canvas 元素，ref 暴露给父组件

```typescript
interface BubbleData {
  symbol: string
  name: string
  date: string
  netInflow: number   // 正=红（流入），负=绿（流出）
  close: number
  volume: number
}
```

**前置:** 无

---

### Task 5: 资金流页面重构为气泡图

**Files:**
- Modify: `frontend/src/pages/MoneyFlowPage.tsx`（完全重写）
- Modify: `frontend/src/components/BubbleCanvas.tsx`（继承 Task 4）

**Interfaces:**
- Consumes: `BubbleCanvas` 组件，`api.moneyFlow()` 返回数据
- Produces: 资金流气泡图页面，含控制面板（日期/股票/频率/暂停/速度）

**前置:** Task 4 完成

---

### Task 6: 打板池排序分组增强

**Files:**
- Modify: `frontend/src/pages/LimitPoolPage.tsx`
- 新增分组折叠逻辑，复用现有 StockCard 组件

**Interfaces:**
- Consumes: `LimitPoolRow[]`，`api.limitPool()` 返回数据
- Produces: 按连板数分组的可折叠卡片，组内按封单额+封板时间排序

**新增筛选字段：**
- 封单额范围滑块
- 换手率范围滑块
- 流通市值范围滑块

**前置:** 无（独立页面修改）

---

### Task 7: 后端监控规则引擎扩展 — money_flow

**Files:**
- Modify: `backend/app/strategy/monitor.py`（`_evaluate_rule` 新增 `elif rtype == "money_flow"`）
- Modify: `backend/app/api/monitor_rules.py`（OPTIONS 端点新增可选字段）

**Interfaces:**
- Consumes: `MonitorRule` 含 `type="money_flow"`，`conditions: [{field: "main_net_inflow", op: ">", value: 1000000}]`
- Produces: `AlertEvent` 事件，触发后推送 SSE + webhook

**实现要点：**
- 在 `_evaluate_rule` 中新增 `elif rtype == "money_flow":` 分支
- 调用 `get_provider("astockdata").get_money_flow()` 查询
- 向量化比较 `df["main_net_inflow"] > threshold`
- 复用现有 cooldown 机制

**前置:** Task 1-3 前端完成即可，后端独立

---

### Task 8: 后端监控规则引擎扩展 — north_bound / margin

**Files:**
- Modify: `backend/app/strategy/monitor.py`（新增 `elif rtype in ("north_bound", "margin")`）
- Modify: `backend/app/api/monitor_rules.py`（OPTIONS 新增可选字段）

**Interfaces:**
- Consumes: `MonitorRule` 含 `type="north_bound"` 或 `type="margin"`
- Produces: `AlertEvent` 事件

**前置:** Task 7 完成

---

## 任务依赖图

```
Task 1 (MonitorMenu组件)
    ├── Task 2 (NorthBound加监控)
    └── Task 3 (Margin加监控)

Task 4 (BubbleCanvas)
    └── Task 5 (资金流气泡图)        ← Task 1-3 无依赖，独立进行

Task 6 (打板池增强)                  ← 独立进行

Task 7 (后端money_flow规则)          ← 前端Task 5完成一部分即可开始
Task 8 (后端north_bound/margin)     ← Task 7完成后
```

**建议并行执行顺序：**
- 第一批：Task 1, 4, 6（组件和页面增强）
- 第二批：Task 2, 3, 5（监控集成 + 气泡图完成）
- 第三批：Task 7, 8（后端规则引擎）

---

## 验证步骤

```bash
# 前端验证
cd frontend && pnpm build  # 必须通过

# 后端验证
cd backend && uv run pytest tests/ -k monitor -v  # 如有监控相关测试

# 手动验证
# 1. 启动后端: uv run uvicorn app.main:app --reload --port 3018
# 2. 启动前端: cd frontend && pnpm dev
# 3. 访问 /money-flow → 气泡图
# 4. 访问 /limit-pool → 按连板分组排序
# 5. 访问 /north-bound → 行右侧有监控按钮
# 6. 访问 /margin → 行右侧有监控按钮
# 7. 访问 /monitor → 规则列表含新增类型
```
