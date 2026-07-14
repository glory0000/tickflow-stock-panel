// 北向资金页面 — 沪股通/深股通资金流向
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Landmark, Bell } from 'lucide-react'
import { DatePicker } from '@/components/DatePicker'
import { api, type NorthBoundRow, type MonitorRule } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { priceColorClass } from '@/lib/format'
import { MonitorMenu } from '@/components/MonitorMenu'
import { QK } from '@/lib/queryKeys'

function fmtAmount(v: number): string {
  if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (Math.abs(v) >= 1e4) return (v / 1e4).toFixed(1) + '万'
  return v.toLocaleString()
}

/** 北向行没有 symbol 字段, 用 type (SH/SZ/HSI/HSCEI) 作为监控规则的虚拟标的 id */
function rowSymbol(row: NorthBoundRow): string {
  return `nb_${row.type}`
}

function NorthBoundTable({
  rows,
  monitoredSymbols,
  onMonitorClick,
}: {
  rows: NorthBoundRow[]
  monitoredSymbols: Set<string>
  onMonitorClick: (row: NorthBoundRow, rect: DOMRect) => void
}) {
  if (rows.length === 0) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted border-b border-border">
            <th className="text-left px-3 py-2 font-medium">日期</th>
            <th className="text-left px-3 py-2 font-medium">类型</th>
            <th className="text-left px-3 py-2 font-medium">名称</th>
            <th className="text-right px-3 py-2 font-medium">净买入</th>
            <th className="text-right px-3 py-2 font-medium">买入额</th>
            <th className="text-right px-3 py-2 font-medium">卖出额</th>
            <th className="text-right px-3 py-2 font-medium">余额</th>
            <th className="text-right px-3 py-2 font-medium">余额占比</th>
            <th className="text-right px-3 py-2 font-medium">持仓市值</th>
            <th className="text-right px-3 py-2 font-medium w-10"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const monitored = monitoredSymbols.has(rowSymbol(row))
            return (
              <tr key={i} className="border-b border-border/50 hover:bg-elevated/50">
                <td className="px-3 py-2 text-secondary">{row.date}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] px-1.5 py-px rounded ${
                    row.type === 'SH' ? 'bg-blue-400/10 text-blue-400' : 'bg-green-400/10 text-green-400'
                  }`}>
                    {row.type}
                  </span>
                </td>
                <td className="px-3 py-2 font-medium">{row.name}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-medium ${priceColorClass(row.net_inflow)}`}>
                  {fmtAmount(row.net_inflow)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-secondary">{fmtAmount(row.buy_amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-secondary">{fmtAmount(row.sell_amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-secondary">{fmtAmount(row.quota_balance)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-secondary">
                  {(row.quota_balance_pct * 100).toFixed(2)}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-secondary">{fmtAmount(row.hold_amount)}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={e => onMonitorClick(row, e.currentTarget.getBoundingClientRect())}
                    title={monitored ? '北向监控已开启' : '开启北向监控'}
                    className={`p-1 rounded transition-colors ${
                      monitored
                        ? 'text-amber-400 hover:bg-amber-400/10'
                        : 'text-muted hover:text-amber-400 hover:bg-amber-400/10'
                    }`}
                  >
                    <Bell className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function NorthBoundPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['north-bound', date],
    queryFn: () => api.northBound(date),
    enabled: !!date,
    staleTime: 5 * 60_000,
  })

  // 北向监控规则 (type='north_bound'): {rowSymbol(row) → rule} 映射
  const { data: monitorRulesData, refetch: refetchMonitorRules } = useQuery({
    queryKey: QK.monitorRules,
    queryFn: () => api.monitorRulesList(),
    staleTime: 30 * 1000,
  })
  const northBoundRules = useMemo(() => {
    const all = monitorRulesData?.rules ?? []
    const m = new Map<string, MonitorRule>()
    for (const r of all) {
      // MonitorMenu 对 north_bound 类型发送 type='north_bound'(后端若不支持可能回退 'ladder');
      // 用 name 前缀 '北向监控' 兜底识别
      const isNb = (r as { type: string }).type === 'north_bound'
        || (r.type === 'ladder' && (r.name ?? '').startsWith('北向监控'))
      if (isNb && r.enabled && r.symbols[0]) {
        m.set(r.symbols[0], r)
      }
    }
    return m
  }, [monitorRulesData])
  const monitoredSymbols = useMemo(() => new Set(northBoundRules.keys()), [northBoundRules])

  // 监控菜单: 当前选中的行 + 锚点
  const [monitorTarget, setMonitorTarget] = useState<{ row: NorthBoundRow; rect: DOMRect } | null>(null)
  const handleMonitorClick = (row: NorthBoundRow, rect: DOMRect) => {
    setMonitorTarget(prev => {
      // 切换同一行关闭; 不同行重新定位
      if (prev?.row.type === row.type && prev.row.date === row.date) return null
      return { row, rect }
    })
  }
  const closeMonitorMenu = () => setMonitorTarget(null)

  const rows = data?.data ?? []

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="北向资金"
        titleExtra={
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-secondary">沪股通 / 深股通 资金流向</span>
          </div>
        }
        right={
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 hover:bg-surface text-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        }
      />
      <div className="flex items-center gap-3 px-5 py-2 border-b border-border">
        <DatePicker value={date} onChange={setDate} />
        {data && (
          <span className="text-xs text-muted">
            {rows.length} 条记录
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Landmark} title="暂无数据" hint="请检查日期是否正确" />
        ) : (
          <NorthBoundTable
            rows={rows}
            monitoredSymbols={monitoredSymbols}
            onMonitorClick={handleMonitorClick}
          />
        )}
      </div>
      {/* 监控菜单浮层 (锚定到行的铃铛按钮) */}
      {monitorTarget && (
        <MonitorMenu
          stock={{ symbol: rowSymbol(monitorTarget.row), name: monitorTarget.row.name }}
          ruleType="north_bound"
          anchorRect={monitorTarget.rect}
          existingRule={northBoundRules.get(rowSymbol(monitorTarget.row))}
          onClose={closeMonitorMenu}
          onChanged={refetchMonitorRules}
        />
      )}
    </div>
  )
}