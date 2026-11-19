import { describe, expect, it } from 'vitest'
import { stripWhiteRim } from './sticker.ts'

describe('old sprites', () => {
  it('strips the baked-in white border but keeps white parts of the object', () => {
    const w = 80
    const h = 60
    const data = new Uint8ClampedArray(w * h * 4)
    const inBody = (x: number, y: number) => x >= 20 && x < 60 && y >= 20 && y < 40
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = Math.max(20 - x, 0, x - 59)
        const dy = Math.max(20 - y, 0, y - 39)
        const o = (y * w + x) * 4
        if (inBody(x, y)) data.set(x >= 36 && x < 44 ? [255, 255, 255, 255] : [40, 60, 90, 255], o)
        else if (Math.hypot(dx, dy) <= 8) data.set([255, 255, 255, 255], o)
      }
    }
    stripWhiteRim({ data, w, h }, 10)
    const alpha = (x: number, y: number) => data[(y * w + x) * 4 + 3]
    expect(alpha(15, 30)).toBe(0)
    expect(alpha(40, 14)).toBe(0)
    expect(alpha(14, 14)).toBe(0)
    expect(alpha(20, 30)).toBe(255)
    expect(alpha(40, 30)).toBe(255)
  })
})
