import { useState } from 'react'
import { Bell, X, AlertCircle } from 'lucide-react'
import { api, type MonitorRule } from '@/lib/api'
import { usePreferences } from '@/lib/useSharedQueries'

/**
 * 通用监控规则配置浮层 — 在股票卡片/行旁点击铃铛后弹出。
 *
 * 支持的 ruleType:
 *  - 'limit_pool_seal': 封单监控 (复用 ladder 分支; 字段 sealed_vol/sealed_amount + threshold)
 *  - 'money_flow':      资金流 (字段 main_net_inflow + main_pct)
 *  - 'north_bound':     北向 (字段 net_inflow)
 *  - 'margin':          两融 (字段 margin_balance)
 *
 * 设计要点:
 *  - fixed 定位 + anchorRect 计算坐标, 脱离父级 overflow-hidden 裁剪
 *  - 阈值输入支持 元/万元/亿元 (或 手/万手) 单位换算
 *  - 推送渠道 (飞书 / 企业微信) 多选, 新建时取用户偏好默认值, 已有规则沿用其值
 *  - 保存调 api.monitorRuleSave, 删除调 api.monitorRuleDelete
 */
export interface MonitorMenuProps {
  /** 监控目标股票 */
  stock: { symbol: string; name?: string | null }
  /** 规则类型 */
  ruleType: 'money_flow' | 'limit_pool_seal' | 'north_bound' | 'margin'
  /** 锚点 (触发浮层的按钮 DOMRect), 用于计算浮层坐标 */
  anchorRect: DOMRect
  /** 关闭浮层 */
  onClose: () => void
  /** 规则保存/删除后回调 (供父组件刷新列表) */
  onChanged?: () => void
  /** 已有规则 (编辑模式; 缺省 = 新建模式) */
  existingRule?: MonitorRule
  /**
   * 免费档用户提示 (例如封单监控需 Pro+ 批量五档能力, 资金流/北向/两融若免费档无对应深度也可禁用保存)
   * true = 不显示警告, false = 显示"当前 Key 权限无法获取 XX"提示并禁用保存按钮
   */
  hasDepth?: boolean
  /** 浮层宽度 (默认 240px, 与 LimitUpLadder 一致) */
  width?: number
}

// ===== 各 ruleType 的配置 =====

interface MetricDef {
  key: string
  label: string
  /** 单位倍率列表 (输入值 × mult = 原始单位) */
  units: { key: string; label: string; mult: number }[]
  /** 切换 metric 时, 阈值输入框默认单位 key */
  defaultUnitKey: string
  /** 是否需要乘以 100 转百分比 (true: 输入百分比, 存原始 0-1; false: 直接存) */
  isPct?: boolean
}

interface RuleTypeConfig {
  /** 浮层标题前缀 */
  titlePrefix: string
  /** 是否有 metric 二选一 (只有 limit_pool_seal 需要; 其它单 metric) */
  metrics?: MetricDef[]
  /** 单 metric (其余类型) */
  metric?: MetricDef
  /** 编辑模式时用于反算单位的字段名 (existing.threshold 取自此字段) */
  thresholdField: 'threshold' | 'conditions'
}

const RULE_TYPE_CONFIG: Record<MonitorMenuProps['ruleType'], RuleTypeConfig> = {
  // 封单监控: 二选一 (量/额), 复用 ladder 存储 (type='ladder', metric)
  limit_pool_seal: {
    titlePrefix: '封单监控',
    metrics: [
      {
        key: 'sealed_vol',
        label: '封单量',
        units: [
          { key: '1', label: '手', mult: 1 },
          { key: '10000', label: '万手', mult: 10000 },
        ],
        defaultUnitKey: '10000',
      },
      {
        key: 'sealed_amount',
        label: '封单额',
        units: [
          { key: '1', label: '元', mult: 1 },
          { key: '10000', label: '万元', mult: 10000 },
          { key: '100000000', label: '亿元', mult: 100000000 },
        ],
        defaultUnitKey: '100000000',
      },
    ],
    thresholdField: 'threshold',
  },
  // 资金流: 主力净流入 (元) + 主力净占比 (%)
  money_flow: {
    titlePrefix: '资金流监控',
    metric: {
      key: 'main_net_inflow',
      label: '主力净流入',
      units: [
        { key: '1', label: '元', mult: 1 },
        { key: '10000', label: '万元', mult: 10000 },
        { key: '100000000', label: '亿元', mult: 100000000 },
      ],
      defaultUnitKey: '100000000',
    },
    thresholdField: 'conditions',
  },
  // 北向: 净买入 (元)
  north_bound: {
    titlePrefix: '北向监控',
    metric: {
      key: 'net_inflow',
      label: '北向净买入',
      units: [
        { key: '1', label: '元', mult: 1 },
        { key: '10000', label: '万元', mult: 10000 },
        { key: '100000000', label: '亿元', mult: 100000000 },
      ],
      defaultUnitKey: '100000000',
    },
    thresholdField: 'conditions',
  },
  // 两融: 融资余额 (元)
  margin: {
    titlePrefix: '两融监控',
    metric: {
      key: 'margin_balance',
      label: '融资余额',
      units: [
        { key: '1', label: '元', mult: 1 },
        { key: '10000', label: '万元', mult: 10000 },
        { key: '100000000', label: '亿元', mult: 100000000 },
      ],
      defaultUnitKey: '100000000',
    },
    thresholdField: 'threshold',
  },
}

// 从 conditions 数组中按 field 提取阈值 (用于 money_flow / north_bound)
function extractConditionThreshold(rule: MonitorRule | undefined, field: string): number | undefined {
  if (!rule?.conditions) return undefined
  const c = rule.conditions.find(c => c.field === field)
  const v = c?.value
  return v == null ? undefined : v
}

export function MonitorMenu({
  stock,
  ruleType,
  anchorRect,
  onClose,
  onChanged,
  existingRule,
  hasDepth = true,
  width = 240,
}: MonitorMenuProps) {
  const config = RULE_TYPE_CONFIG[ruleType]

  // 推送渠道默认值: 取偏好设置中的全局默认 (已有规则沿用其值)
  const { data: prefs } = usePreferences()
  const webhookDefaultChannels = prefs?.webhook_default_channels ?? []

  // ===== 状态 =====
  // 1) metric: limit_pool_seal 二选一; 其它类型固定
  const [metricKey, setMetricKey] = useState<string>(() => {
    if (config.metrics) {
      return existingRule?.metric ?? config.metrics[0].key
    }
    return config.metric!.key
  })
  const activeMetric: MetricDef =
    (config.metrics?.find(m => m.key === metricKey)) ?? config.metric!

  // 2) 单位 (unitKey): 已有规则反算到最大便捷单位, 新建取默认
  const [unitKey, setUnitKey] = useState<string>(() => {
    const rawThreshold =
      config.thresholdField === 'threshold'
        ? existingRule?.threshold
        : extractConditionThreshold(existingRule, activeMetric.key)
    if (!rawThreshold) return activeMetric.defaultUnitKey
    // 选能整除的最大倍率
    const matched = [...activeMetric.units].reverse().find(u => rawThreshold >= u.mult && rawThreshold % u.mult === 0)
    return matched ? matched.key : activeMetric.units[0].key
  })

  // 3) 阈值字符串 (用户输入值, 已除以单位倍率)
  const [threshold, setThreshold] = useState<string>(() => {
    const rawThreshold =
      config.thresholdField === 'threshold'
        ? existingRule?.threshold
        : extractConditionThreshold(existingRule, activeMetric.key)
    if (!rawThreshold) return ''
    const mult = activeMetric.units.find(u => u.key === unitKey)?.mult ?? 1
    return String(rawThreshold / mult)
  })

  // 切 metric 时重置单位 + 清空阈值 (limit_pool_seal 才有此操作)
  const switchMetric = (m: string) => {
    setMetricKey(m)
    const next = config.metrics?.find(mm => mm.key === m)
    if (next) {
      setUnitKey(next.defaultUnitKey)
      setThreshold('')
    }
  }

  // 4) 推送渠道
  const [pushChannels, setPushChannels] = useState<string[]>(
    existingRule?.webhook_channels ?? webhookDefaultChannels,
  )
  const togglePushChannel = (ch: string) =>
    setPushChannels(cur => cur.includes(ch) ? cur.filter(c => c !== ch) : [...cur, ch])

  const [saving, setSaving] = useState(false)

  // 规则 id: 同一股票+同一 ruleType 唯一
  const ruleId = `mr_${ruleType}_${stock.symbol.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`

  // ===== 保存 / 删除 =====
  const handleSave = async () => {
    const inputValue = Number(threshold)
    if (!threshold || isNaN(inputValue) || inputValue < 0) return
    const mult = activeMetric.units.find(u => u.key === unitKey)?.mult ?? 1
    const thr = Math.round(inputValue * mult)

    setSaving(true)
    try {
      if (ruleType === 'limit_pool_seal') {
        // 复用 ladder 规则 (后端只识别 type='ladder', metric=sealed_vol|sealed_amount)
        await api.monitorRuleSave({
          id: ruleId,
          name: `${config.titlePrefix} · ${stock.name ?? stock.symbol}`,
          enabled: true,
          type: 'ladder',
          scope: 'symbols',
          symbols: [stock.symbol],
          direction: 'up',
          metric: metricKey as 'sealed_vol' | 'sealed_amount',
          threshold: thr,
          conditions: [],
          logic: 'and',
          cooldown_seconds: existingRule?.cooldown_seconds ?? 600,
          severity: 'warn',
          message: '',
          webhook_channels: pushChannels,
        } as MonitorRule)
      } else {
        // money_flow / north_bound / margin: 走 conditions 模式
        const conditions = [
          { field: activeMetric.key, op: '>' as const, value: thr },
        ]
        // 资金流同时支持 main_pct 百分比阈值 (本浮层暂只暴露金额阈值, 百分比留给 RuleEditor 高级模式)
        await api.monitorRuleSave({
          id: ruleId,
          name: `${config.titlePrefix} · ${stock.name ?? stock.symbol}`,
          enabled: true,
          type: ruleType as 'money_flow' | 'north_bound' | 'margin',
          scope: 'symbols',
          symbols: [stock.symbol],
          direction: 'up',
          conditions,
          logic: 'and',
          cooldown_seconds: existingRule?.cooldown_seconds ?? 600,
          severity: 'warn',
          message: '',
          webhook_channels: pushChannels,
        } as unknown as MonitorRule)
      }
      onChanged?.()
      onClose()
    } catch { /* toast 已在 api 层处理 */ }
    finally { setSaving(false) }
  }

  const handleRemove = async () => {
    setSaving(true)
    try {
      await api.monitorRuleDelete(ruleId)
      onChanged?.()
      onClose()
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  // ===== 定位 (fixed, 脱离父级 overflow-hidden) =====
  const MENU_H = 340
  const anchorRight = anchorRect.right
  const anchorBottom = anchorRect.bottom
  const left = Math.max(8, Math.min(anchorRight - width, window.innerWidth - width - 8))
  const top = anchorBottom + MENU_H > window.innerHeight
    ? Math.max(8, anchorRect.top - MENU_H)
    : anchorBottom + 4

  // 各 ruleType 的免费档警告文案
  const warnText = !hasDepth ? (
    ruleType === 'limit_pool_seal'
      ? '当前 Key 权限无法获取五档行情,后续会适配免费数据源'
      : '当前 Key 权限不满足监控触发条件,后续会适配免费数据源'
  ) : null

  return (
    <>
      {/* 点击遮罩关闭 */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 rounded-lg bg-surface border border-border shadow-xl text-xs overflow-hidden"
        style={{ left, top, width }}
        role="dialog"
        aria-label={`${config.titlePrefix} 配置`}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-elevated/40">
          <div className="flex items-center gap-1.5 min-w-0">
            <Bell className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="font-medium text-foreground truncate">{stock.name ?? stock.symbol}</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground shrink-0" aria-label="关闭">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="px-3 py-2.5 space-y-2.5">
          {/* 类型徽章 */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted shrink-0">类型</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/15 text-accent">
              {config.titlePrefix}
            </span>
          </div>

          {/* 指标选择 (仅 limit_pool_seal) */}
          {config.metrics && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted shrink-0 w-8">指标</span>
              <div className="flex gap-0.5 flex-1 bg-elevated/50 rounded p-0.5">
                {config.metrics.map(m => (
                  <button
                    key={m.key}
                    onClick={() => switchMetric(m.key)}
                    className={`flex-1 px-2 py-1 rounded text-[11px] transition-colors ${
                      metricKey === m.key
                        ? 'bg-surface text-foreground shadow-sm'
                        : 'text-muted hover:text-secondary'
                    }`}
                  >{m.label}</button>
                ))}
              </div>
            </div>
          )}

          {/* 阈值: 输入 + 单位 */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted shrink-0 w-8">阈值</span>
            <input
              type="number"
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
              placeholder="≤ 报警"
              className="flex-1 min-w-0 h-7 px-2 rounded bg-base border border-border text-foreground text-center tabular-nums placeholder:text-muted/40 focus:outline-none focus:border-accent/50"
            />
            <select
              value={unitKey}
              onChange={e => setUnitKey(e.target.value)}
              className="h-7 px-1.5 rounded bg-base border border-border text-secondary text-[11px] focus:outline-none focus:border-accent/50 cursor-pointer"
            >
              {activeMetric.units.map(u => (
                <option key={u.key} value={u.key}>{u.label}</option>
              ))}
            </select>
          </div>

          {/* 推送渠道 */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted shrink-0 w-8">推送</span>
            {([
              { key: 'feishu', label: '飞书' },
              { key: 'wecom', label: '企业微信' },
            ] as const).map(ch => {
              const on = pushChannels.includes(ch.key)
              return (
                <button
                  key={ch.key}
                  type="button"
                  onClick={() => togglePushChannel(ch.key)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-colors border cursor-pointer ${
                    on
                      ? 'bg-accent/15 text-accent border-accent/40'
                      : 'bg-elevated/40 text-muted border-border hover:text-secondary'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-accent' : 'bg-muted/50'}`} />
                  {ch.label}
                </button>
              )
            })}
          </div>

          {/* 权限提示 (免费用户) */}
          {warnText && (
            <div className="flex items-start gap-1.5 rounded border border-amber-400/30 bg-amber-400/5 px-2 py-1.5 text-[10px] leading-relaxed text-amber-400/90">
              <AlertCircle className="h-3 w-3 shrink-0 mt-px" />
              <span>{warnText}</span>
            </div>
          )}
        </div>

        {/* 底部按钮区 */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border bg-elevated/30">
          {existingRule && (
            <button
              onClick={handleRemove}
              disabled={saving || !hasDepth}
              className="shrink-0 h-7 px-2.5 rounded text-[11px] text-muted hover:text-danger hover:bg-danger/5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >关闭监控</button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !threshold || !hasDepth}
            title={!hasDepth ? '需更高 Key 权限' : ''}
            className="flex-1 h-7 rounded text-[11px] font-medium transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-accent text-white hover:bg-accent/90 active:scale-[0.98] disabled:active:scale-100"
          >
            {saving ? '保存中…' : !hasDepth ? '需更高权限' : existingRule ? '更新监控' : '开启监控'}
          </button>
        </div>
      </div>
    </>
  )
}