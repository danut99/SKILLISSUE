import { describe, expect, it } from 'vitest'
import { extractLoop, rms } from './loop.ts'

const SR = 16000

function recording(burst: (t: number) => number, from: number, to: number, seconds = 2) {
  const pcm = new Float32Array(SR * seconds)
  const rnd = (i: number) => (((i * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.002
  for (let i = 0; i < pcm.length; i++) {
    const t = i / SR
    pcm[i] = rnd(i) + (t >= from && t < to ? burst(t) : 0)
  }
  return pcm
}

describe('extractLoop', () => {
  it('returns null for silence', () => {
    expect(extractLoop(recording(() => 0, 0, 0), SR)).toBeNull()
  })

  it('cuts the loud BRRRM out of a mostly quiet recording', () => {
    const loop = extractLoop(recording((t) => 0.5 * Math.sin(2 * Math.PI * 110 * t), 0.8, 1.6), SR)
    expect(loop).not.toBeNull()
    expect(loop!.length).toBe(Math.round(0.45 * SR))
    expect(rms(loop!)).toBeGreaterThan(0.5)
  })

  it('wraps around seamlessly', () => {
    const f = 97.3
    const loop = extractLoop(recording((t) => 0.4 * Math.sin(2 * Math.PI * f * t), 0, 2), SR)!
    const maxStep = 0.9 * 2 * Math.PI * f / SR
    expect(Math.abs(loop[0] - loop[loop.length - 1])).toBeLessThan(maxStep * 1.5)
  })
})
