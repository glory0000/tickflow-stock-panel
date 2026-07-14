// 资金流页面 — 主力/超大/大/中/小单净流入
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { DatePicker } from '@/components/DatePicker'
import { api, type MoneyFlowRow } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { fmtPct, priceColorClass } from '@/lib/format'

function fmtAmount(v: number): string {
  if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (Math.abs(v) >= 1e4) return (v / 1e4).toFixed(1) + '万'
  return v.toLocaleString()
}

function FlowBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(Math.abs(value) / max, 1) * 100 : 0
  const isPositive = value >= 0
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-2 bg-elevated rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${isPositive ? 'bg-bull' : 'bg-bear'}`}
          style={{ width: `${pct}%`, marginLeft: isPositive ? 0 : 'auto', marginRight: isPositive ? 'auto' : 0 }}
        />
      </div>
      <span className={`text-[11px] tabular-nums ${isPositive ? 'text-bull' : 'text-bear'}`}>
        {fmtAmount(value)}
      </span>
    </div>
  )
}

function MoneyFlowTable({ rows }: { rows: MoneyFlowRow[] }) {
  if (rows.length === 0) return null

  const maxNet = Math.max(...rows.map(r => Math.abs(r.main_net_inflow)), 1)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted border-b border-border">
            <th className="text-left px-3 py-2 font-medium">日期</th>
            <th className="text-right px-3 py-2 font-medium">收盘价</th>
            <th className="text-right px-3 py-2 font-medium">涨跌幅</th>
            <th className="text-right px-3 py-2 font-medium">成交量</th>
            <th className="text-right px-3 py-2 font-medium">主力净流入</th>
            <th className="text-right px-3 py-2 font-medium">超大单</th>
            <th className="text-right px-3 py-2 font-medium">大单</th>
            <th className="text-right px-3 py-2 font-medium">中单</th>
            <th className="text-right px-3 py-2 font-medium">小单</th>
            <th className="text-right px-3 py-2 font-medium">主力占比</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-elevated/50">
              <td className="px-3 py-2 text-secondary">{row.date}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.close.toFixed(2)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${priceColorClass(row.pct_change)}`}>
                {fmtPct(row.pct_change)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-secondary">
                {row.volume >= 1e8 ? (row.volume / 1e8).toFixed(2) + '亿' : row.volume >= 1e4 ? (row.volume / 1e4).toFixed(1) + '万' : row.volume.toLocaleString()}
              </td>
              <td className="px-3 py-2"><FlowBar value={row.main_net_inflow} max={maxNet} /></td>
              <td className="px-3 py-2"><FlowBar value={row.huge_net_inflow} max={maxNet} /></td>
              <td className="px-3 py-2"><FlowBar value={row.big_net_inflow} max={maxNet} /></td>
              <td className="px-3 py-2 text-right tabular-nums text-secondary">{fmtAmount(row.mid_net_inflow)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-secondary">{fmtAmount(row.small_net_inflow)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-secondary">{(row.main_pct * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function MoneyFlowPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [symbols, setSymbols] = useState('000001.SZ')
  const [freq, setFreq] = useState<'daily' | 'minute'>('daily')

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['money-flow', date, symbols, freq],
    queryFn: () => api.moneyFlow(symbols.split(',').map(s => s.trim()).filter(Boolean), date, freq),
    enabled: !!date && !!symbols,
    staleTime: 5 * 60_000,
  })

  const rows = data?.data ?? []

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="资金流"
        titleExtra={
          <div className="flex items-center gap-2 text-xs text-secondary">
            <span>主力资金 / 超大单 / 大单 / 中单 / 小单 净流入</span>
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
            <div className="flex items-center rounded-full bg-elevated/60 p-0.5">
              {(['daily', 'minute'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFreq(f)}
                  className={`px-2.5 py-1 rounded-full text-xs transition-all ${
                    freq === f ? 'bg-accent/15 text-accent font-medium' : 'text-muted hover:text-secondary'
                  }`}
                >
                  {f === 'daily' ? '日线' : '分钟'}
                </button>
              ))}
            </div>
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
          <EmptyState icon={RefreshCw} title="暂无数据" hint="请检查股票代码或日期是否正确" />
        ) : (
          <MoneyFlowTable rows={rows} />
        )}
      </div>
    </div>
  )
}
