// 打板池页面 — 涨停/跌停股票池
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Flame } from 'lucide-react'
import { DatePicker } from '@/components/DatePicker'
import { api, type LimitPoolRow } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { fmtPct, priceColorClass } from '@/lib/format'

function boardTag(symbol: string): { label: string; cls: string } | null {
  if (/^(300|301)/.test(symbol)) return { label: '创', cls: 'text-orange-400 bg-orange-400/10' }
  if (/^688/.test(symbol)) return { label: '科', cls: 'text-cyan-400 bg-cyan-400/10' }
  if (/\.BJ$/.test(symbol)) return { label: '北', cls: 'text-purple-400 bg-purple-400/10' }
  return null
}

function fmtAmount(v: number): string {
  if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (Math.abs(v) >= 1e4) return (v / 1e4).toFixed(1) + '万'
  return v.toLocaleString()
}

function LimitPoolTable({ rows }: { rows: LimitPoolRow[] }) {
  if (rows.length === 0) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted border-b border-border">
            <th className="text-left px-3 py-2 font-medium">代码</th>
            <th className="text-left px-3 py-2 font-medium">名称</th>
            <th className="text-right px-3 py-2 font-medium">收盘价</th>
            <th className="text-right px-3 py-2 font-medium">涨跌幅</th>
            <th className="text-right px-3 py-2 font-medium">换手率</th>
            <th className="text-right px-3 py-2 font-medium">流通市值</th>
            <th className="text-right px-3 py-2 font-medium">封单额</th>
            <th className="text-right px-3 py-2 font-medium">炸板率</th>
            <th className="text-right px-3 py-2 font-medium">连板数</th>
            <th className="text-left px-3 py-2 font-medium">状态</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const tag = boardTag(row.symbol)
            return (
              <tr key={i} className="border-b border-border/50 hover:bg-elevated/50">
                <td className="px-3 py-2 font-mono text-secondary">{row.symbol.replace(/\.SZ$|\.SH$|\.BJ$/g, '')}</td>
                <td className="px-3 py-2">
                  <span className="font-medium">{row.name}</span>
                  {tag && (
                    <span className={`ml-1 text-[9px] px-1 py-px rounded ${tag.cls}`}>{tag.label}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{row.close.toFixed(2)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${priceColorClass(row.pct_change)}`}>
                  {fmtPct(row.pct_change)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-secondary">
                  {(row.turnover_rate * 100).toFixed(2)}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-secondary">{fmtAmount(row.float_mv)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-secondary">{fmtAmount(row.limit_amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-secondary">
                  {row.break_rate > 0 ? `${(row.break_rate * 100).toFixed(1)}%` : '-'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-accent font-medium">{row.continuous_days}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] px-1.5 py-px rounded ${
                    row.status === 'limit_up' ? 'bg-bull/15 text-bull' : 'bg-bear/15 text-bear'
                  }`}>
                    {row.status === 'limit_up' ? '涨停' : '跌停'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function LimitPoolPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [status, setStatus] = useState<'limit_up' | 'limit_down' | 'all'>('limit_up')

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['limit-pool', date, status],
    queryFn: () => api.limitPool(date, status),
    enabled: !!date,
    staleTime: 5 * 60_000,
  })

  const rows = data?.data ?? []

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="打板池"
        titleExtra={
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-400" />
            <span className="text-xs text-secondary">涨停 / 跌停 股票池</span>
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full bg-elevated/60 p-0.5">
              {([
                { key: 'limit_up', label: '涨停' },
                { key: 'limit_down', label: '跌停' },
                { key: 'all', label: '全部' },
              ] as const).map(s => (
                <button
                  key={s.key}
                  onClick={() => setStatus(s.key)}
                  className={`px-2.5 py-1 rounded-full text-xs transition-all ${
                    status === s.key
                      ? s.key === 'limit_up' ? 'bg-bull/15 text-bull font-medium'
                      : s.key === 'limit_down' ? 'bg-bear/15 text-bear font-medium'
                      : 'bg-accent/15 text-accent font-medium'
                      : 'text-muted hover:text-secondary'
                  }`}
                >
                  {s.label}
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
            {rows.length} 只股票
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Flame} title="暂无数据" hint="该日期无打板数据" />
        ) : (
          <LimitPoolTable rows={rows} />
        )}
      </div>
    </div>
  )
}
