// 北向资金页面 — 沪股通/深股通资金流向
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Landmark } from 'lucide-react'
import { DatePicker } from '@/components/DatePicker'
import { api, type NorthBoundRow } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { priceColorClass } from '@/lib/format'

function fmtAmount(v: number): string {
  if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (Math.abs(v) >= 1e4) return (v / 1e4).toFixed(1) + '万'
  return v.toLocaleString()
}

function NorthBoundTable({ rows }: { rows: NorthBoundRow[] }) {
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
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
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
            </tr>
          ))}
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
          <NorthBoundTable rows={rows} />
        )}
      </div>
    </div>
  )
}
