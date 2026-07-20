// 两融数据页面 — 融资融券
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, BarChart3, Bell } from 'lucide-react'
import { DatePicker } from '@/components/DatePicker'
import { api, type MarginRow, type MonitorRule } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { MonitorMenu } from '@/components/MonitorMenu'
import { QK } from '@/lib/queryKeys'

function fmtAmount(v: number): string {
  if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (Math.abs(v) >= 1e4) return (v / 1e4).toFixed(1) + '万'
  return v.toLocaleString()
}

function MarginTable({
  rows,
  monitoredSymbols,
  onMonitorClick,
}: {
  rows: MarginRow[]
  monitoredSymbols: Set<string>
  onMonitorClick: (row: MarginRow, rect: DOMRect) => void
}) {
  if (rows.length === 0) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted border-b border-border">
            <th className="text-left px-3 py-2 font-medium">日期</th>
            <th className="text-left px-3 py-2 font-medium">代码</th>
            <th className="text-right px-3 py-2 font-medium">融资余额</th>
            <th className="text-right px-3 py-2 font-medium">融资买入额</th>
            <th className="text-right px-3 py-2 font-medium">融资偿还额</th>
            <th className="text-right px-3 py-2 font-medium">融券余额</th>
            <th className="text-right px-3 py-2 font-medium">融券卖出量</th>
            <th className="text-right px-3 py-2 font-medium">融券偿还量</th>
            <th className="text-right px-3 py-2 font-medium">净融资余额</th>
            <th className="text-right px-3 py-2 font-medium">融资占比</th>
            <th className="text-right px-3 py-2 font-medium w-10"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const monitored = monitoredSymbols.has(row.symbol)
            return (
              <tr key={i} className="border-b border-border/50 hover:bg-elevated/50">
                <td className="px-3 py-2 text-secondary">{row.date}</td>
                <td className="px-3 py-2 font-mono text-secondary">{row.symbol}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtAmount(row.margin_balance)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-secondary">{fmtAmount(row.margin_buy)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-secondary">{fmtAmount(row.margin_repay)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtAmount(row.short_balance)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-secondary">{fmtAmount(row.short_sell)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-secondary">{fmtAmount(row.short_cover)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtAmount(row.net_balance)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-secondary">
                  {row.margin_pct > 0 ? `${(row.margin_pct * 100).toFixed(2)}%` : '-'}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={e => onMonitorClick(row, e.currentTarget.getBoundingClientRect())}
                    title={monitored ? '两融监控已开启' : '开启两融监控'}
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

export function MarginPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [symbols, setSymbols] = useState('000001.SZ')

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['margin', date, symbols],
    queryFn: () => api.margin(symbols.split(',').map(s => s.trim()).filter(Boolean), date),
    enabled: !!date && !!symbols,
    staleTime: 5 * 60_000,
  })

  // 两融监控规则 (type='margin'): {row.symbol → rule} 映射
  const { data: monitorRulesData, refetch: refetchMonitorRules } = useQuery({
    queryKey: QK.monitorRules,
    queryFn: () => api.monitorRulesList(),
    staleTime: 30 * 1000,
  })
  const marginRules = useMemo(() => {
    const all = monitorRulesData?.rules ?? []
    const m = new Map<string, MonitorRule>()
    for (const r of all) {
      // MonitorMenu 对 margin 类型发送 type='margin'(后端若不支持可能回退 'ladder');
      // 用 name 前缀 '两融监控' 兜底识别
      const isMargin = (r as { type: string }).type === 'margin'
        || (r.type === 'ladder' && (r.name ?? '').startsWith('两融监控'))
      if (isMargin && r.enabled && r.symbols[0]) {
        m.set(r.symbols[0], r)
      }
    }
    return m
  }, [monitorRulesData])
  const monitoredSymbols = useMemo(() => new Set(marginRules.keys()), [marginRules])

  // 监控菜单: 当前选中的行 + 锚点
  const [monitorTarget, setMonitorTarget] = useState<{ row: MarginRow; rect: DOMRect } | null>(null)
  const handleMonitorClick = (row: MarginRow, rect: DOMRect) => {
    setMonitorTarget(prev => {
      // 切换同一行关闭; 不同行重新定位
      if (prev?.row.symbol === row.symbol && prev.row.date === row.date) return null
      return { row, rect }
    })
  }
  const closeMonitorMenu = () => setMonitorTarget(null)

  const rows = data?.data ?? []

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="两融数据"
        titleExtra={
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-accent" />
            <span className="text-xs text-secondary">融资融券 数据</span>
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={symbols}
              onChange={e => setSymbols(e.target.value)}
              placeholder="股票代码，多个逗号分隔"
              className="h-7 w-48 px-2 rounded bg-elevated border border-border text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50"
            />
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-1.5 hover:bg-surface text-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
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
          <EmptyState icon={BarChart3} title="暂无数据" hint="请检查股票代码或日期是否正确" />
        ) : (
          <MarginTable
            rows={rows}
            monitoredSymbols={monitoredSymbols}
            onMonitorClick={handleMonitorClick}
          />
        )}
      </div>
      {/* 监控菜单浮层 (锚定到行的铃铛按钮) */}
      {monitorTarget && (
        <MonitorMenu
          stock={{ symbol: monitorTarget.row.symbol, name: monitorTarget.row.symbol }}
          ruleType="margin"
          anchorRect={monitorTarget.rect}
          existingRule={marginRules.get(monitorTarget.row.symbol)}
          onClose={closeMonitorMenu}
          onChanged={refetchMonitorRules}
        />
      )}
    </div>
  )
}
