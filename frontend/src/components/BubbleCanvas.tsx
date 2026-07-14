import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

// ===== Types =====

export interface BubbleData {
  symbol: string
  name: string
  date: string
  netInflow: number   // 正=红（流入），负=绿（流出）
  close: number
  volume: number
}

export interface BubbleCanvasProps {
  bubbles: BubbleData[]
  paused: boolean
  speed: number  // 0.5 ~ 2.0
}

interface Bubble {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  netInflow: number
  symbol: string
  name: string
  date: string
  color: string
  isInflow: boolean
}

// ===== Physics Constants =====

const GRAVITY = 0.08        // px/frame²（绿色气泡）
const BUOYANCY = 0.06       // px/frame²（红色气泡）
const DAMPING = 0.98        // 每帧乘以速度
const ATTRACTION = 0.02     // 吸引系数
const ATTRACTION_RANGE = 200 // 吸引范围 px
const ELASTICITY = 0.5      // 碰撞弹性
const BOUNDARY_BOUNCE = 0.7 // 边界反弹系数
const GROUND_FRICTION = 0.85
const MAX_SPEED = 8         // px/frame
const MAX_BUBBLES = 200
const SCALE_FACTOR = 0.6   // radius = clamp(sqrt(|netInflow|) * SCALE_FACTOR, 8, 60)

// ===== Helpers =====

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function formatInflow(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (abs >= 1e4) return (v / 1e4).toFixed(1) + '万'
  return v.toLocaleString()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildBubbles(data: BubbleData[], width: number, height: number): Bubble[] {
  const sorted = [...data]
    .sort((a, b) => Math.abs(b.netInflow) - Math.abs(a.netInflow))
    .slice(0, MAX_BUBBLES)

  const groundY = height - 40
  const skyY = groundY * 0.15

  return sorted.map(row => {
    const isInflow = row.netInflow >= 0
    const radius = clamp(Math.sqrt(Math.abs(row.netInflow)) * SCALE_FACTOR, 8, 60)
    // 初始位置：随机分布在画布中央区域
    const x = radius + Math.random() * (width - radius * 2)
    const y = skyY + radius + Math.random() * (groundY - skyY - radius * 2)
    const color = isInflow ? '#ff4444' : '#44ff44'
    return { x, y, vx: 0, vy: 0, radius, netInflow: row.netInflow, symbol: row.symbol, name: row.name, date: row.date, color, isInflow }
  })
}

// ===== Component =====

export const BubbleCanvas = forwardRef<HTMLCanvasElement, BubbleCanvasProps>(
  ({ bubbles, paused, speed }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const animRef = useRef<number>(0)
    const bubblesRef = useRef<Bubble[]>([])
    const pausedRef = useRef(paused)
    const speedRef = useRef(speed)
    const [hovered, setHovered] = useState<Bubble | null>(null)
    const [tooltip, setTooltip] = useState<{ x: number; y: number; html: string } | null>(null)
    const mouseRef = useRef<{ mx: number; my: number } | null>(null)

    // Keep refs in sync with props
    useEffect(() => { pausedRef.current = paused }, [paused])
    useEffect(() => { speedRef.current = speed }, [speed])

    useImperativeHandle(ref, () => canvasRef.current!)

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const el = canvas as HTMLCanvasElement
      const ctx = el.getContext('2d')!
      let lastTime = 0

      function resize() {
        const dpr = window.devicePixelRatio || 1
        const rect = el.getBoundingClientRect()
        el.width = rect.width * dpr
        el.height = rect.height * dpr
        ctx.scale(dpr, dpr)
      }

      resize()
      const ro = new ResizeObserver(resize)
      ro.observe(el)

      bubblesRef.current = buildBubbles(bubbles, el.width / (window.devicePixelRatio || 1), el.height / (window.devicePixelRatio || 1))

      function loop(time: number) {
        const delta = lastTime ? Math.min((time - lastTime) / 16.667, 3) * speedRef.current : 1
        lastTime = time

        const dpr = window.devicePixelRatio || 1
        const W = el.width / dpr
        const H = el.height / dpr
        const groundY = H - 40
        const skyY = groundY * 0.15

        const bs = bubblesRef.current
        const N = bs.length

        if (!pausedRef.current) {
          // Physics
          for (let i = 0; i < N; i++) {
            const b = bs[i]
            // 重力/浮力
            if (b.isInflow) {
              b.vy -= BUOYANCY * delta
            } else {
              b.vy += GRAVITY * delta
            }
            // 阻力
            b.vx *= Math.pow(DAMPING, delta)
            b.vy *= Math.pow(DAMPING, delta)
            // 速度上限
            const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy)
            if (spd > MAX_SPEED) {
              const s = MAX_SPEED / spd
              b.vx *= s; b.vy *= s
            }
            // 位置更新
            b.x += b.vx * delta
            b.y += b.vy * delta
          }

          // 吸引计算
          for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
              const a = bs[i], b = bs[j]
              const dx = b.x - a.x, dy = b.y - a.y
              const dist = Math.sqrt(dx * dx + dy * dy)
              if (dist < ATTRACTION_RANGE && dist > 0.1) {
                const f = ATTRACTION * (ATTRACTION_RANGE - dist) / ATTRACTION_RANGE
                const fx = f * dx / dist, fy = f * dy / dist
                a.vx += fx * delta; a.vy += fy * delta
                b.vx -= fx * delta; b.vy -= fy * delta
              }
            }
          }

          // 边界检测
          for (let i = 0; i < N; i++) {
            const b = bs[i]
            const r = b.radius
            // 左右
            if (b.x - r < 0) { b.x = r; b.vx = Math.abs(b.vx) * BOUNDARY_BOUNCE }
            if (b.x + r > W) { b.x = W - r; b.vx = -Math.abs(b.vx) * BOUNDARY_BOUNCE }
            // 地面
            if (b.y + r > groundY) {
              b.y = groundY - r
              b.vy = -Math.abs(b.vy) * BOUNDARY_BOUNCE
              if (!b.isInflow) b.vx *= GROUND_FRICTION
            }
            // 天空
            if (b.y - r < skyY) { b.y = skyY + r; b.vy = Math.abs(b.vy) * BOUNDARY_BOUNCE }
          }

          // 碰撞检测
          for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
              const a = bs[i], b = bs[j]
              const dx = b.x - a.x, dy = b.y - a.y
              const dist = Math.sqrt(dx * dx + dy * dy)
              const minD = a.radius + b.radius
              if (dist < minD && dist > 0.1) {
                const nx = dx / dist, ny = dy / dist
                const overlap = minD - dist
                // 分离
                a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5
                b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5
                // 速度交换（弹性碰撞）
                const dvx = a.vx - b.vx, dvy = a.vy - b.vy
                const dvn = dvx * nx + dvy * ny
                if (dvn > 0) {
                  const impulse = dvn * ELASTICITY
                  a.vx -= impulse * nx; a.vy -= impulse * ny
                  b.vx += impulse * nx; b.vy += impulse * ny
                }
              }
            }
          }
        }

        // ===== 渲染 =====
        ctx.clearRect(0, 0, W, H)

        // 背景分区
        // 天空（红色区域）
        ctx.fillStyle = 'rgba(255, 80, 80, 0.04)'
        ctx.fillRect(0, 0, W, skyY)
        // 地面（绿色区域）
        ctx.fillStyle = 'rgba(80, 255, 80, 0.04)'
        ctx.fillRect(0, groundY, W, H - groundY)
        // 地面线
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, groundY)
        ctx.lineTo(W, groundY)
        ctx.stroke()

        // 气泡（按 |netInflow| 降序，大气泡在底层）
        const sorted = [...bs].sort((a, b2) => Math.abs(b2.netInflow) - Math.abs(a.netInflow))
        for (const b of sorted) {
          const isHovered = hovered === b
          const r = isHovered ? b.radius * 1.1 : b.radius
          const cx = b.x, cy = b.y

          // 径向渐变
          const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r)
          const col = b.isInflow ? { c1: '#ff6666', c2: '#cc0000' } : { c1: '#66ff66', c2: '#00cc00' }
          grad.addColorStop(0, col.c1)
          grad.addColorStop(1, col.c2)

          ctx.beginPath()
          ctx.arc(cx, cy, r, 0, Math.PI * 2)
          ctx.fillStyle = grad
          ctx.fill()
          // 描边
          ctx.strokeStyle = 'rgba(255,255,255,0.3)'
          ctx.lineWidth = 0.3
          ctx.stroke()

          // 高光
          if (r > 18) {
            ctx.beginPath()
            ctx.arc(cx - r * 0.28, cy - r * 0.28, r * 0.22, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(255,255,255,0.35)'
            ctx.fill()
          }
        }

        // Tooltip
        setTooltip(null)

        animRef.current = requestAnimationFrame(loop)
      }

      animRef.current = requestAnimationFrame(loop)

      return () => {
        cancelAnimationFrame(animRef.current)
        ro.disconnect()
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bubbles])

    // Hover detection
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      // TypeScript can't narrow const in closures, so use a distinct const
      const el: HTMLCanvasElement = canvas

      function onMouseMove(e: MouseEvent) {
        const rect = el.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        mouseRef.current = { mx, my }

        // 从小到大遍历（小的在上面）
        const sorted = [...bubblesRef.current].sort((a, b) => Math.abs(a.netInflow) - Math.abs(b.netInflow))
        let found: Bubble | null = null
        for (const b of sorted) {
          const dx = mx - b.x, dy = my - b.y
          if (dx * dx + dy * dy <= b.radius * b.radius) {
            found = b
            break
          }
        }
        setHovered(found)
        if (found) {
          const inflowStr = formatInflow(found.netInflow)
          const sign = found.netInflow >= 0 ? '+' : ''
          const color = found.isInflow ? '#ff6666' : '#66ff66'
          setTooltip({
            x: Math.min(found.x + found.radius + 8, rect.width - 160),
            y: Math.max(found.y - 20, 8),
            html: `<div style="font-size:11px;line-height:1.6"><b>${escapeHtml(found.name)}</b> (${escapeHtml(found.symbol)})</div><div style="color:${color}">${sign}${inflowStr}</div><div style="color:#888;font-size:10px">${escapeHtml(found.date)}</div>`,
          })
        }
      }

      function onMouseLeave() {
        mouseRef.current = null
        setHovered(null)
      }

      el.addEventListener('mousemove', onMouseMove)
      el.addEventListener('mouseleave', onMouseLeave)
      return () => {
        el.removeEventListener('mousemove', onMouseMove)
        el.removeEventListener('mouseleave', onMouseLeave)
      }
    }, [])

    return (
      <div className="relative w-full h-full">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair"
        />
        {tooltip && (
          <div
            className="absolute pointer-events-none bg-surface/90 border border-border rounded px-2 py-1.5 text-xs shadow-lg z-10"
            style={{ left: tooltip.x, top: tooltip.y }}
            dangerouslySetInnerHTML={{ __html: tooltip.html }}
          />
        )}
      </div>
    )
  }
)

BubbleCanvas.displayName = 'BubbleCanvas'
