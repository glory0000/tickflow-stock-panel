// 打板池页面 — 连板分组 + 折叠 + 筛选
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Flame, ChevronDown, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { DatePicker } from '@/components/DatePicker'
import { api, type LimitPoolRow } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { fmtPct, priceColorClass } from '@/lib/format'

// ===== Helpers =====
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

function tierLabel(days: number): string {
  if (days === 1) return '首板'
  return `${days}连板`
}

// ===== Range Filter =====
interface RangeFilterProps {
  label: string
  min: number
  max: number
  value: [number, number]
  onChange: (v: [number, number]) => void
  fmt?: (v: number) => string
}

function RangeFilter({ label, min, max, value, onChange, fmt = v => v.toString() }: RangeFilterProps) {
  const [localMin, localMax] = value
  const isFiltered = localMin > min || localMax < max
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted">
      <span className="shrink-0 w-10">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={localMin}
        onChange={e => onChange([parseFloat(e.target.value), localMax])}
        className="w-16 h-1 accent-accent"
      />
      <span className="tabular-nums w-12 text-right">{fmt(localMin)}</span>
      <span>~</span>
      <input
        type="range"
        min={min}
        max={max}
        value={localMax}
        onChange={e => onChange([localMin, parseFloat(e.target.value)])}
        className="w-16 h-1 accent-accent"
      />
      <span className="tabular-nums w-12 text-right">{fmt(localMax)}</span>
      {isFiltered && (
        <button
          onClick={() => onChange([min, max])}
          className="text-[9px] text-accent hover:underline ml-1"
        >
          重置
        </button>
      )}
    </div>
  )
}

// ===== Stock Row =====
function StockRow({ row }: { row: LimitPoolRow }) {
  const tag = boardTag(row.symbol)
  return (
    <tr className="border-b border-border/50 hover:bg-elevated/50 text-xs">
      <td className="px-3 py-1.5 font-mono text-secondary">{row.symbol.replace(/\.SZ$|\.SH$|\.BJ$/g, '')}</td>
      <td className="px-3 py-1.5">
        <span className="font-medium">{row.name}</span>
        {tag && <span className={`ml-1 text-[9px] px-1 py-px rounded ${tag.cls}`}>{tag.label}</span>}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">{row.close.toFixed(2)}</td>
      <td className={`px-3 py-1.5 text-right tabular-nums ${priceColorClass(row.pct_change)}`}>
        {fmtPct(row.pct_change)}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-secondary">{(row.turnover_rate * 100).toFixed(2)}%</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-secondary">{fmtAmount(row.float_mv)}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-secondary">{fmtAmount(row.limit_amount)}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-secondary">
        {row.break_rate > 0 ? `${(row.break_rate * 100).toFixed(1)}%` : '-'}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-accent font-medium">{row.continuous_days}</td>
      <td className="px-3 py-1.5 text-left">
        <span className={`text-[10px] px-1.5 py-px rounded ${
          row.status === 'limit_up' ? 'bg-bull/15 text-bull' : 'bg-bear/15 text-bear'
        }`}>
          {row.status === 'limit_up' ? '涨停' : '跌停'}
        </span>
      </td>
    </tr>
  )
}

// ===== Group Card =====
interface GroupCardProps {
  days: number
  rows: LimitPoolRow[]
  defaultOpen: boolean
}

function GroupCard({ days, rows, defaultOpen }: GroupCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const label = tierLabel(days)

  return (
    <div className="border-b border-border/60">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-elevated/40 transition-colors text-left"
      >
        <Flame className={`h-4 w-4 shrink-0 ${rows[0]?.status === 'limit_up' ? 'text-orange-400' : 'text-blue-400'}`} />
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted">({rows.length} 只)</span>
        <span className="ml-auto">
          {open
            ? <ChevronDown className="h-4 w-4 text-muted" />
            : <ChevronRight className="h-4 w-4 text-muted" />
          }
        </span>
      </button>

      {/* Content */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border/40 text-[10px]">
                  <th className="text-left px-3 py-1 font-medium">代码</th>
                  <th className="text-left px-3 py-1 font-medium">名称</th>
                  <th className="text-right px-3 py-1 font-medium">价</th>
                  <th className="text-right px-3 py-1 font-medium">涨跌</th>
                  <th className="text-right px-3 py-1 font-medium">换手</th>
                  <th className="text-right px-3 py-1 font-medium">流通市</th>
                  <th className="text-right px-3 py-1 font-medium">封单额</th>
                  <th className="text-right px-3 py-1 font-medium">炸板</th>
                  <th className="text-right px-3 py-1 font-medium">连板</th>
                  <th className="text-left px-3 py-1 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <StockRow key={i} row={row} />
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ===== Main Page =====
export function LimitPoolPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [status, setStatus] = useState<'limit_up' | 'limit_down' | 'all'>('limit_up')

  // 筛选状态
  const [sealedRange, setSealedRange] = useState<[number, number]>([0, Infinity])
  const [turnoverRange, setTurnoverRange] = useState<[number, number]>([0, Infinity])
  const [mvRange, setMvRange] = useState<[number, number]>([0, Infinity])

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['limit-pool', date, status],
    queryFn: () => api.limitPool(date, status),
    enabled: !!date,
    staleTime: 5 * 60_000,
  })

  const rows = data?.data ?? []

  // 计算筛选范围
  const { sealedMin, sealedMax, turnoverMin, turnoverMax, mvMin, mvMax } = useMemo(() => {
    if (rows.length === 0) return { sealedMin: 0, sealedMax: 0, turnoverMin: 0, turnoverMax: 0, mvMin: 0, mvMax: 0 }
    return {
      sealedMin: Math.min(...rows.map(r => r.limit_amount)),
      sealedMax: Math.max(...rows.map(r => r.limit_amount)),
      turnoverMin: Math.min(...rows.map(r => r.turnover_rate)),
      turnoverMax: Math.max(...rows.map(r => r.turnover_rate)),
      mvMin: Math.min(...rows.map(r => r.float_mv)),
      mvMax: Math.max(...rows.map(r => r.float_mv)),
    }
  }, [rows])

  // 应用筛选
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (r.limit_amount < sealedRange[0] || (sealedRange[1] !== Infinity && r.limit_amount > sealedRange[1])) return false
      if (r.turnover_rate < turnoverRange[0] || (turnoverRange[1] !== Infinity && r.turnover_rate > turnoverRange[1])) return false
      if (r.float_mv < mvRange[0] || (mvRange[1] !== Infinity && r.float_mv > mvRange[1])) return false
      return true
    })
  }, [rows, sealedRange, turnoverRange, mvRange])

  // 分组 + 组内排序
  const groups = useMemo(() => {
    const map = new Map<number, LimitPoolRow[]>()
    for (const row of filtered) {
      const d = row.continuous_days
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(row)
    }
    // 组内排序: 封单额降序, 首板时间早优先 (nulls last)
    for (const [, grp] of map) {
      grp.sort((a, b) => {
        const byAmount = b.limit_amount - a.limit_amount
        if (byAmount !== 0) return byAmount
        if (a.first_limit_time && b.first_limit_time) {
          return a.first_limit_time.localeCompare(b.first_limit_time)
        }
        if (a.first_limit_time) return -1
        if (b.first_limit_time) return 1
        return 0
      })
    }
    // 组按连板数降序排列
    return [...map.entries()].sort(([a], [b]) => b - a)
  }, [filtered])

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="打板池"
        titleExtra={
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-400" />
            <span className="text-xs text-secondary">涨停 / 跌停 股票池 · 按连板分组</span>
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

      {/* 控制栏 */}
      <div className="flex items-center gap-4 px-5 py-2 border-b border-border flex-wrap">
        <DatePicker value={date} onChange={setDate} />
        {data && (
          <span className="text-xs text-muted">
            {rows.length} 只 → {filtered.length} 只
          </span>
        )}
        <div className="flex items-center gap-4 ml-auto flex-wrap">
          <RangeFilter
            label="封单额"
            min={sealedMin}
            max={sealedMax}
            value={sealedRange}
            onChange={v => setSealedRange(v)}
            fmt={fmtAmount}
          />
          <RangeFilter
            label="换手率"
            min={turnoverMin}
            max={turnoverMax}
            value={turnoverRange}
            onChange={v => setTurnoverRange(v)}
            fmt={v => `${(v * 100).toFixed(1)}%`}
          />
          <RangeFilter
            label="流通市"
            min={mvMin}
            max={mvMax}
            value={mvRange}
            onChange={v => setMvRange(v)}
            fmt={fmtAmount}
          />
        </div>
      </div>

      {/* 分组列表 */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Flame} title="暂无数据" hint="该日期无打板数据或筛选条件无结果" />
        ) : (
          groups.map(([days, grp]) => (
            <GroupCard
              key={days}
              days={days}
              rows={grp}
              defaultOpen={days <= 2}
            />
          ))
        )}
      </div>
    </div>
  )
}
