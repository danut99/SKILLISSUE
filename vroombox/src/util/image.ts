export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/** readback: the canvas will be read with getImageData many times (editing tools), so keep it in CPU memory. */
export function ctx2d(c: HTMLCanvasElement, readback = false): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', readback ? { willReadFrequently: true } : undefined)
  if (!ctx) throw new Error('Canvas 2D not available')
  return ctx
}

/** Decodes an image blob (honoring EXIF rotation), downscaled so the long side is at most maxSide. */
export async function loadImage(file: Blob, maxSide = 1280): Promise<HTMLCanvasElement> {
  let source: ImageBitmap | HTMLImageElement
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('decode failed'))
      }
      img.src = url
    })
  }
  const w = source.width
  const h = source.height
  const k = Math.min(1, maxSide / Math.max(w, h))
  const c = makeCanvas(w * k, h * k)
  ctx2d(c).drawImage(source, 0, 0, c.width, c.height)
  if ('close' in source) source.close()
  return c
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type))
}

export async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  return loadImage(blob, 4096)
}

/** A round crop of `source` centered at (cx, cy) with radius r (source pixels), with a dark tire edge. */
export function circleCrop(source: CanvasImageSource, cx: number, cy: number, r: number, size = 160): HTMLCanvasElement {
  const c = makeCanvas(size, size)
  const g = ctx2d(c)
  g.save()
  g.beginPath()
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  g.clip()
  g.fillStyle = '#222'
  g.fillRect(0, 0, size, size)
  g.drawImage(source, cx - r, cy - r, r * 2, r * 2, 0, 0, size, size)
  g.restore()
  g.lineWidth = size * 0.06
  g.strokeStyle = '#111'
  g.beginPath()
  g.arc(size / 2, size / 2, size / 2 - g.lineWidth / 2, 0, Math.PI * 2)
  g.stroke()
  return c
}
