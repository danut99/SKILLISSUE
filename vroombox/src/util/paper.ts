/** Line drawings become solid stickers: every area enclosed by the strokes gets filled with paper. Pure, so it is tested. */
export type Rgba = { data: Uint8ClampedArray; w: number; h: number }

const ALPHA_ON = 40

/** Labels 4-connected transparent regions; returns which of them touch the image border (= outside, not enclosed). */
function transparentRegions(img: Rgba): { label: Int32Array; open: boolean[] } {
  const { data, w, h } = img
  const clear = (i: number) => data[i * 4 + 3] <= ALPHA_ON
  const label = new Int32Array(w * h).fill(-1)
  const open: boolean[] = []
  const stack: number[] = []
  for (let s = 0; s < w * h; s++) {
    if (label[s] !== -1 || !clear(s)) continue
    const id = open.length
    let touches = false
    label[s] = id
    stack.push(s)
    while (stack.length) {
      const p = stack.pop() as number
      const x = p % w
      const y = (p - x) / w
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && label[q] === -1 && clear(q)) {
          label[q] = id
          stack.push(q)
        }
      }
    }
    open.push(touches)
  }
  return { label, open }
}

/** Fills every enclosed transparent area with `rgb`. Returns how many pixels were filled. */
export function fillHoles(img: Rgba, rgb: [number, number, number]): number {
  const { label, open } = transparentRegions(img)
  let n = 0
  for (let i = 0; i < label.length; i++) {
    if (label[i] < 0 || open[label[i]]) continue
    img.data.set([rgb[0], rgb[1], rgb[2], 255], i * 4)
    n++
  }
  return n
}
