import { audio } from '../audio/audio.ts'
import type { View } from '../game/render.ts'
import { t } from '../i18n.ts'

export const CLIP_W = 720
export const CLIP_H = 1280
export const CLIP_GAME_VIEW: View = { x: 24, y: 222, w: CLIP_W - 48, h: 812 }

export type Clip = { blob: Blob; ext: 'mp4' | 'webm' }

export function clipSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'
}

function pickMime(): string {
  const types = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

/** Records a canvas plus everything the game plays through the audio master bus. */
export class ClipRecorder {
  private rec: MediaRecorder | null = null
  private chunks: Blob[] = []
  private mime = ''

  start(canvas: HTMLCanvasElement): boolean {
    if (!clipSupported()) return false
    try {
      const tracks = [...canvas.captureStream(30).getVideoTracks(), ...(audio.recordStream()?.getAudioTracks() ?? [])]
      this.mime = pickMime()
      this.chunks = []
      this.rec = new MediaRecorder(
        new MediaStream(tracks),
        this.mime ? { mimeType: this.mime, videoBitsPerSecond: 3_500_000 } : undefined,
      )
      this.rec.ondataavailable = (e) => {
        if (e.data.size) this.chunks.push(e.data)
      }
      this.rec.start(250)
      return true
    } catch {
      this.rec = null
      return false
    }
  }

  stop(): Promise<Clip | null> {
    const rec = this.rec
    if (!rec) return Promise.resolve(null)
    this.rec = null
    return new Promise((resolve) => {
      rec.onstop = () => {
        const type = (this.mime || rec.mimeType || 'video/webm').split(';')[0]
        const blob = new Blob(this.chunks, { type })
        resolve(blob.size ? { blob, ext: type.includes('mp4') ? 'mp4' : 'webm' } : null)
      }
      try {
        rec.stop()
      } catch {
        resolve(null)
      }
    })
  }

  abort(): void {
    if (!this.rec) return
    try {
      this.rec.onstop = null
      this.rec.stop()
    } catch {
      /* already stopped */
    }
    this.rec = null
  }
}

export async function shareOrSave(clip: Clip, fileBase: string, text: string): Promise<'shared' | 'saved' | 'cancelled'> {
  const file = new File([clip.blob], `${fileBase}.${clip.ext}`, { type: clip.blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(clip.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'saved'
}

/** label: mode line under the name; big: the main number; sub: stars or flips. */
export type ClipInfo = { name: string; label: string; big: string; sub: string; slowmo: boolean }

/** The vertical 9:16 frame: title, vehicle name, the game view, the distance and a call to action. */
export function drawClipFrame(g: CanvasRenderingContext2D, info: ClipInfo, renderGame: (view: View) => void): void {
  const bg = g.createLinearGradient(0, 0, 0, CLIP_H)
  bg.addColorStop(0, '#16213e')
  bg.addColorStop(1, '#0f3460')
  g.fillStyle = bg
  g.fillRect(0, 0, CLIP_W, CLIP_H)

  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  g.font = '900 88px system-ui, sans-serif'
  const a = 'VROOM'
  const b = 'BOX'
  const total = g.measureText(a + b).width
  const x0 = (CLIP_W - total) / 2
  g.fillStyle = '#0b1530'
  g.fillText(a + b, x0 + 4, 116)
  g.fillStyle = '#fff'
  g.fillText(a, x0, 110)
  g.fillStyle = '#ffd23f'
  g.fillText(b, x0 + g.measureText(a).width, 110)

  g.textAlign = 'center'
  g.font = '800 38px system-ui, sans-serif'
  g.fillStyle = '#cfd8ff'
  const name = info.name.length > 26 ? `${info.name.slice(0, 25)}…` : info.name
  g.fillText(name, CLIP_W / 2, 160)
  g.font = '800 26px system-ui, sans-serif'
  g.fillStyle = '#ffd23f'
  g.fillText(info.label, CLIP_W / 2, 198)

  const v = CLIP_GAME_VIEW
  g.save()
  g.beginPath()
  g.roundRect(v.x, v.y, v.w, v.h, 28)
  g.clip()
  renderGame(v)
  g.restore()
  g.lineWidth = 6
  g.strokeStyle = '#fff'
  g.beginPath()
  g.roundRect(v.x, v.y, v.w, v.h, 28)
  g.stroke()

  const badge = (text: string, x: number, color: string) => {
    g.font = '900 30px system-ui, sans-serif'
    const w = g.measureText(text).width + 32
    g.fillStyle = color
    g.beginPath()
    g.roundRect(x, v.y + 22, w, 48, 24)
    g.fill()
    g.fillStyle = '#fff'
    g.textAlign = 'left'
    g.fillText(text, x + 16, v.y + 57)
    return w
  }
  const w1 = badge(`▶ ${t.replay}`, v.x + 22, '#e63946')
  if (info.slowmo) badge(`🐢 ${t.slowmo}`, v.x + 34 + w1, '#3a86ff')

  g.textAlign = 'center'
  g.font = '900 120px system-ui, sans-serif'
  g.fillStyle = '#ffd23f'
  g.fillText(info.big, CLIP_W / 2, 1148)
  g.font = '800 34px system-ui, sans-serif'
  g.fillStyle = '#ffffff'
  if (info.sub) g.fillText(info.sub, CLIP_W / 2, 1200)
  g.fillStyle = '#9fb0de'
  g.font = '800 30px system-ui, sans-serif'
  g.fillText(`🛞 ${t.clipCta} · VROOMBOX`, CLIP_W / 2, 1250)
}
