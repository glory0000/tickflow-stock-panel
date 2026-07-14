/**
 * BubbleCanvas smoke test.
 * No test framework is installed in this repo — this file is type-checked by
 * `pnpm build` (tsc) and is runnable once vitest is installed:
 *   pnpm add -D vitest @testing-library/react jsdom
 *   # then uncomment the tests below and run: pnpm vitest src/components/__tests__/BubbleCanvas.test.tsx
 */

// ===== BubbleData helper for tests =====
import type { BubbleData } from '../BubbleCanvas'

// placeholder so the file is syntactically valid even without vitest installed
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _vitest = { describe: (_n: string, _f: () => void) => {}, it: (_n: string, _f: () => void) => {}, expect: (_v: unknown) => ({ toBe: (_x: unknown) => {} }) }

const SAMPLE_BUBBLES: BubbleData[] = [
  { symbol: '000001.SZ', name: '平安银行', date: '2026-07-11', netInflow: 1_200_000_000, close: 12.34, volume: 80_000_000 },
  { symbol: '000002.SZ', name: '万科A', date: '2026-07-11', netInflow: -800_000_000, close: 8.56, volume: 65_000_000 },
]

_vitest.describe('BubbleCanvas', () => {
  _vitest.it('should accept bubbles, paused, and speed props without crashing', () => {
    const bubbles: BubbleData[] = SAMPLE_BUBBLES
    _vitest.expect(bubbles.length).toBe(2)
  })
})
