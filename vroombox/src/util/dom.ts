type Child = Node | string | null | undefined | false

/** Tiny DOM builder: el('button.btn.big', { onclick }, 'Text'). */
export function el<K extends keyof HTMLElementTagNameMap>(
  spec: K | `${K}.${string}`,
  props: Partial<Omit<HTMLElementTagNameMap[K], 'style'>> & { style?: string; dataset?: Record<string, string> } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = spec.split('.') as [K, ...string[]]
  const node = document.createElement(tag)
  if (classes.length) node.className = classes.join(' ')
  const { style, dataset, ...rest } = props
  Object.assign(node, rest)
  if (style) node.setAttribute('style', style)
  if (dataset) Object.assign(node.dataset, dataset)
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c)
  return node
}

export function toast(text: string, ms = 1400): void {
  const node = el('div.toast', {}, text)
  node.style.animationDuration = `${ms}ms`
  document.body.append(node)
  setTimeout(() => node.remove(), ms)
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* not supported (iOS) */
  }
}

export const DPR_CAP = 2

/** Keeps a canvas' backing store matched to its CSS size (capped DPR). Returns a disposer. */
export function autoSizeCanvas(canvas: HTMLCanvasElement, onResize: (w: number, h: number) => void): () => void {
  const fit = () => {
    const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1)
    const r = canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(r.width * dpr))
    const h = Math.max(1, Math.round(r.height * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    onResize(w, h)
  }
  const ro = new ResizeObserver(fit)
  ro.observe(canvas)
  fit()
  return () => ro.disconnect()
}

/** Pointer position in canvas backing-store pixels. */
export function canvasPoint(canvas: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect()
  return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height }
}
