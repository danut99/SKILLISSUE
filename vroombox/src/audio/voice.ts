import { audio } from './audio.ts'
import type { VoiceClip } from '../vehicle.ts'
import { extractLoop, rms } from './loop.ts'

export function micAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  )
}

/**
 * Records for `seconds`, reporting the live level (0..1), and returns a seamless engine loop,
 * or null when nothing loud enough was heard. Throws when microphone access is refused.
 */
export async function recordClip(seconds: number, onLevel: (level: number) => void, signal?: AbortSignal): Promise<VoiceClip | null> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })
  if (signal?.aborted) { stream.getTracks().forEach((track) => track.stop()); return null }
  let raf = 0
  try {
    const c = audio.ctx
    audio.unlock()
    const source = c.createMediaStreamSource(stream)
    const analyser = c.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    const frame = new Float32Array(analyser.fftSize)
    const tick = () => {
      analyser.getFloatTimeDomainData(frame)
      onLevel(Math.min(1, rms(frame) * 5))
      raf = requestAnimationFrame(tick)
    }
    tick()

    const rec = new MediaRecorder(stream)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    const stopped = new Promise<void>((resolve) => {
      rec.onstop = () => resolve()
    })
    rec.start()
    await new Promise<void>((resolve) => {
      const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve() }
      const timer = setTimeout(finish, seconds * 1000)
      signal?.addEventListener('abort', finish, { once: true })
    })
    rec.stop()
    await stopped
    if (signal?.aborted) return null
    cancelAnimationFrame(raf)
    onLevel(0)
    source.disconnect()

    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
    const decoded = await c.decodeAudioData(await blob.arrayBuffer())
    const mono = new Float32Array(decoded.length)
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const d = decoded.getChannelData(ch)
      for (let i = 0; i < d.length; i++) mono[i] += d[i] / decoded.numberOfChannels
    }
    const pcm = extractLoop(mono, decoded.sampleRate)
    return pcm ? { sampleRate: decoded.sampleRate, pcm } : null
  } finally {
    cancelAnimationFrame(raf)
    stream.getTracks().forEach((tr) => tr.stop())
  }
}
