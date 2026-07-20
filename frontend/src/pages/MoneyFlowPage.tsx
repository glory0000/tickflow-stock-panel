// 资金流页面 — BubbleCanvas 气泡图
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Pause, Play } from 'lucide-react'
import { DatePicker } from '@/components/DatePicker'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { BubbleCanvas, type BubbleData } from '@/components/BubbleCanvas'

export function MoneyFlowPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [symbols, setSymbols] = useState('000001.SZ')
  const [freq, setFreq] = useState<'daily' | 'minute'>('daily')
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['money-flow', date, symbols, freq],
    queryFn: () => api.moneyFlow(symbols.split(',').map(s => s.trim()).filter(Boolean), date, freq),
    enabled: !!date && !!symbols,
    staleTime: 5 * 60_000,
  })

  const rows = data?.data ?? []

  // Map MoneyFlowRow[] → BubbleData[]
  const bubbles = useMemo<BubbleData[]>(() => {
    return rows.map(row => ({
      symbol: row.symbol,
      name: row.symbol, // MoneyFlowRow has no name field, use symbol
      date: row.date,
      netInflow: row.main_net_inflow,
      close: row.close,
      volume: row.volume,
    }))
  }, [rows])

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="资金流"
        titleExtra={
          <div className="flex items-center gap-2 text-xs text-secondary">
            <span>主力资金气泡图 · 红=流入 · 绿=流出</span>
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
            {rows.length} 条记录 · {bubbles.length} 个气泡
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {/* 暂停/继续 */}
          <button
            onClick={() => setPaused(p => !p)}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded text-xs text-muted hover:text-foreground hover:bg-elevated transition-colors"
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? '继续' : '暂停'}
          </button>
          {/* 速度滑块 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted">速度</span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={speed}
              onChange={e => setSpeed(parseFloat(e.target.value))}
              className="w-20 h-1 accent-accent"
            />
            <span className="text-[10px] text-muted tabular-nums w-8">{speed.toFixed(1)}x</span>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="h-6 w-6 animate-spin text-muted" />
          </div>
        ) : bubbles.length === 0 ? (
          <EmptyState icon={RefreshCw} title="暂无数据" hint="请检查股票代码或日期是否正确" />
        ) : (
          <BubbleCanvas bubbles={bubbles} paused={paused} speed={speed} />
        )}
      </div>
    </div>
  )
}
