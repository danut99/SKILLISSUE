/**
 * Turns a raw "BRRRM" recording into a short seamless loop:
 * finds the loudest window, removes DC, normalizes and crossfades the tail into the head.
 * Returns null when the recording is too short or too quiet.
 */
export function extractLoop(
  pcm: Float32Array,
  sampleRate: number,
  loopSeconds = 0.45,
  fadeSeconds = 0.04,
  minRms = 0.012,
): Float32Array | null {
  const L = Math.round(loopSeconds * sampleRate)
  const F = Math.round(fadeSeconds * sampleRate)
  if (pcm.length < L + F) return null

  const win = Math.max(1, Math.round(0.01 * sampleRate))
  const nWin = Math.floor(pcm.length / win)
  const energy = new Float64Array(nWin)
  for (let w = 0; w < nWin; w++) {
    let s = 0
    for (let i = w * win; i < (w + 1) * win; i++) s += pcm[i] * pcm[i]
    energy[w] = s
  }
  const span = Math.min(nWin, Math.ceil((L + F) / win))
  let sum = 0
  for (let w = 0; w < span; w++) sum += energy[w]
  let best = sum
  let bestW = 0
  for (let w = span; w < nWin; w++) {
    sum += energy[w] - energy[w - span]
    if (sum > best) {
      best = sum
      bestW = w - span + 1
    }
  }
  const start = Math.min(bestW * win, pcm.length - (L + F))
  const seg = pcm.subarray(start, start + L + F)

  let mean = 0
  for (const v of seg) mean += v
  mean /= seg.length
  let sq = 0
  let peak = 0
  for (const v of seg) {
    const c = v - mean
    sq += c * c
    peak = Math.max(peak, Math.abs(c))
  }
  if (Math.sqrt(sq / seg.length) < minRms || peak === 0) return null

  const gain = Math.min(8, 0.9 / peak)
  const out = new Float32Array(L)
  for (let i = 0; i < L; i++) {
    const head = (seg[i] - mean) * gain
    if (i < F) {
      const t = i / F
      const tail = (seg[L + i] - mean) * gain
      out[i] = head * t + tail * (1 - t)
    } else out[i] = head
  }
  return out
}

export function rms(pcm: ArrayLike<number>): number {
  let s = 0
  for (let i = 0; i < pcm.length; i++) s += pcm[i] * pcm[i]
  return Math.sqrt(s / Math.max(1, pcm.length))
}
