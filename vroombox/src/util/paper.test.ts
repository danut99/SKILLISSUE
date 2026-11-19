import { describe, expect, it } from 'vitest'
import { fillHoles, type Rgba } from './paper.ts'

/** A kid-style line drawing: an outlined box and an outlined wheel overlapping its bottom line. */
function outlineCar(): Rgba {
  const w = 320
  const h = 200
  const img: Rgba = { data: new Uint8ClampedArray(w * h * 4), w, h }
  const ink = (x: number, y: number) => {
    const inBox = x >= 40 && x <= 280 && y >= 40 && y <= 130
    const onBox = inBox && (x < 46 || x > 274 || y < 46 || y > 124)
    const onWheel = Math.abs(Math.hypot(x - 90, y - 140) - 27) <= 3
    return onBox || onWheel
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(x + 0.5, y + 0.5)) img.data.set([25, 25, 25, 255], (y * w + x) * 4)
  return img
}

describe('fillHoles', () => {
  it('fills the inside of closed shapes but not the outside', () => {
    const img = outlineCar()
    expect(fillHoles(img, [255, 255, 255])).toBeGreaterThan(0)
    const alpha = (x: number, y: number) => img.data[(y * img.w + x) * 4 + 3]
    expect(alpha(160, 85)).toBe(255)
    expect(alpha(90, 150)).toBe(255)
    expect(alpha(5, 5)).toBe(0)
    expect(alpha(160, 190)).toBe(0)
  })
})
