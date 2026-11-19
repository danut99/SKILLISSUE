import { audio } from './audio.ts'
import { extractLoop, rms } from './loop.ts'

export type VoiceEngineData = { kind: 'voice'; sampleRate: number; pcm: Float32Array }

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
export async function recordEngine(seconds: number, onLevel: (level: number) => void): Promise<VoiceEngineData | null> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })
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
    await new Promise((r) => setTimeout(r, seconds * 1000))
    rec.stop()
    await stopped
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
    const loop = extractLoop(mono, decoded.sampleRate)
    return loop ? { kind: 'voice', sampleRate: decoded.sampleRate, pcm: loop } : null
  } finally {
    cancelAnimationFrame(raf)
    stream.getTracks().forEach((tr) => tr.stop())
  }
}
