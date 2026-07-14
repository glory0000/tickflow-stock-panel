# a-stock-data 后续增强设计

## Context

Phase 1-3 已完成：Bridge 服务、4 个数据集、前端 4 个基础页面已接入。

本次增强三项：
1. **监控规则集成** — 在各数据页内就近设置监控
2. **资金流气泡图** — Canvas 物理引擎，红色流入/绿色流出，带重力/浮力/碰撞
3. **打板池增强** — 封单数+封板时间排序，按连板数分组展示

---

## 1. 监控规则集成

### 交互设计

**各数据页内就近管理**（参考 LimitUpLadder 的 MonitorMenu 模式）：

- 资金流页：股票卡片右侧显示监控按钮（铃铛图标），点击弹出配置浮层
- 打板池页：已有 MonitorMenu，复用
- 北向/两融页：同上

**统一展示**：所有规则同时出现在 `/monitor` 页面统一管理

### 新增规则类型

| 类型标识 | 触发条件 | 适用页面 |
|---------|---------|---------|
| `money_flow` | 主力净流入突破阈值（金额/百分比） | 资金流 |
| `limit_pool_seal` | 封单额/封单量突破阈值（已有 ladder 型可复用） | 打板池 |
| `north_bound` | 北向净买入突破阈值 | 北向 |
| `margin` | 融资余额/融资金额突破阈值 | 两融 |

### 数据结构扩展

在 `MonitorRule` 中新增字段：

```typescript
// 新增 condition 支持的 field（前端用，后端存字符串）
type MonitorField =
  | 'main_net_inflow' | 'main_pct'           // 资金流
  | 'sealed_vol' | 'sealed_amount' | 'continuous_days'  // 打板池
  | 'net_inflow' | 'buy_amount' | 'quota_balance'      // 北向
  | 'margin_balance' | 'margin_buy' | 'short_balance'   // 两融
```

### 规则引擎扩展

`MonitorRuleEngine._evaluate_rule` 新增 `elif rtype == "money_flow":` 分支，调用各 Provider 的查询方法，在 cooldown 内做阈值比较。

---

## 2. 资金流气泡图

### 渲染架构

**Canvas 2D + 自定义物理引擎**，不使用 Three.js / PixiJS / D3 force。

### 物理引擎规格

```
画布分区：
┌──────────────────────────────────────────────┐
│  天空边界 (y = 0 ~ groundY * 0.15)         │  ← 红色气泡浮力聚集区
│─────────────────────────────────────────────│
│                                              │
│           自由运动区                          │
│         (气泡吸引/碰撞/滑动)                  │
│                                              │
│─────────────────────────────────────────────│  ← 地面边界 (y = height - 40px)
│  地面层 (y = height - 40px ~ height)        │  ← 绿色气泡重力下沉区
└──────────────────────────────────────────────┘
     左边界 x=0                         右边界 x=width
```

### 气泡属性

| 属性 | 说明 |
|-----|------|
| x, y | 位置（像素） |
| vx, vy | 速度向量 |
| radius | 气泡半径 = sqrt(|net_inflow|) * scaleFactor，范围 8~60px |
| color | 红色（流入，正值）或绿色（流出，负值） |
| netInflow | 原始净流入金额 |
| date | 数据日期（tooltip 显示用） |
| symbol | 股票代码 |

### 物理参数

| 参数 | 值 |
|-----|-----|
| 重力加速度 gravity | 0.08 px/frame²（绿色气泡） |
| 浮力 buoyancy | 0.06 px/frame²（红色气泡） |
| 阻力 damping | 0.98（每帧乘以速度） |
| 吸引系数 attraction | 0.02（气泡间距离 < 200px 时） |
| 碰撞弹性 elasticity | 0.5 |
| 边界反弹系数 boundaryBounce | 0.7 |
| 地面摩擦 groundFriction | 0.85 |
| 最大速度 maxSpeed | 8 px/frame |

### 气泡间吸引力

- 两气泡距离 d < 200px 时，产生吸引力
- 力大小 = attraction × (200 - d) / 200
- 方向：沿连线方向
- 绿色气泡重力效果强，会通过间隙向下滑动；红色气泡浮力效果强，向上滑动

### 地面/天空边界

- **地面**（y = height - 40）：绿色气泡碰地面产生摩擦，速度衰减
- **天空**（y = groundY × 0.15）：红色气泡碰顶后反弹
- **左右边界**：反弹，vx × -boundaryBounce

### 动画循环

- `requestAnimationFrame`，目标 60fps
- 每帧：更新位置 → 施加重力/浮力 → 应用阻力 → 边界检测 → 吸引计算 → 碰撞检测 → 渲染
-气泡按 netInflow 大小降序排列绘制（大气泡在底层）

### 渲染

- 圆形渐变填充（中心亮，边缘暗）
- 红色：径向渐变 `#ff4444` → `#cc0000`
- 绿色：径向渐变 `#44ff44` → `#00cc00`
- 描边：半透明白色 0.3px
- Hover：放大 1.1 倍 + tooltip 显示股票名/日期/净流入金额

### 控制面板

- 日期选择器（切换不同日期数据）
- 股票代码输入框（多选，逗号分隔）
- 频率切换（日线/分钟）
- 暂停/继续动画按钮
- 气泡速度滑块（0.5x ~ 2x）

### 性能

- 最大 200 个气泡，超出则按 |net_inflow| 绝对值截断
- 使用 `OffscreenCanvas` 在 Worker 计算（如果浏览器支持），主线程只负责渲染
- 窗口 resize 时重新计算边界

---

## 3. 打板池增强

### 排序规则

**同连板组内**按以下复合排序：

1. **首要**：封单额降序（`sealed_amount = sealed_vol × 100 × close`）
2. **次要**：封板时间早优先（`first_limit_time` 早 → 排序靠前）

**连板数分组**（显示在同一个区块内，但视觉上分组）：

| 连板数 | 显示标签 |
|-------|---------|
| 1 | 首板 |
| 2 | 2连板 |
| 3 | 3连板 |
| ... | n连板 |

### 视觉设计

- 每组一个可折叠卡片（类似 TierGroup）
- 卡片头部：`Flame` 图标 + 连板标签 + 股票数量
- 卡片内：股票卡片网格（复用 StockCard 组件）
- 展开状态持久化到 localStorage

### 筛选增强

现有状态筛选保留，新增：
- 封单额范围滑块（min ~ max）
- 换手率范围滑块
- 流通市值范围滑块

---

## 文件变更清单

### 后端

| 文件 | 变更 |
|-----|------|
| `backend/app/strategy/monitor.py` | 新增 `money_flow`/`north_bound`/`margin` 规则类型分支 |
| `backend/app/api/monitor_rules.py` | OPTIONS 端点新增可选字段枚举 |
| `backend/app/api/astockdata.py` | 已有，无需修改 |

### 前端

| 文件 | 变更 |
|-----|------|
| `frontend/src/pages/MoneyFlowPage.tsx` | 重构为气泡图页面 |
| `frontend/src/pages/LimitPoolPage.tsx` | 增强排序+分组展示+筛选 |
| `frontend/src/pages/NorthBoundPage.tsx` | 增加 MonitorMenu |
| `frontend/src/pages/MarginPage.tsx` | 增加 MonitorMenu |
| `frontend/src/components/MonitorMenu.tsx` | 新建，通用监控配置浮层 |
| `frontend/src/components/BubbleCanvas.tsx` | 新建，气泡图画布组件 |
| `frontend/src/lib/api.ts` | 新增规则相关 API 方法（如有） |

---

## 技术约束

- 气泡图纯 Canvas 2D，不引入 Three.js/PixiJS/D3
- 物理引擎每帧 O(n²) 碰撞检测，n ≤ 200 时可接受
- 监控规则扩展不改现有五种类型的行为
- 所有新增前端组件遵循项目现有样式（Tailwind + framer-motion）
