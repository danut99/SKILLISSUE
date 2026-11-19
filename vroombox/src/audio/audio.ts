import type { EngineData } from '../vehicle.ts'

class AudioSys {
  private context: AudioContext | null = null
  private out: GainNode | null = null
  private recDest: MediaStreamAudioDestinationNode | null = null
  private noiseBuf: AudioBuffer | null = null

  get ctx(): AudioContext {
    if (!this.context) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.context = new Ctor({ latencyHint: 'interactive' })
      this.out = this.context.createGain()
      this.out.gain.value = 0.9
      this.out.connect(this.context.destination)
    }
    return this.context
  }

  get master(): GainNode {
    void this.ctx
    return this.out as GainNode
  }

  /** Must run inside a user gesture at least once (autoplay policy). */
  unlock(): void {
    const c = this.ctx
    if (c.state !== 'running') void c.resume().catch(() => {})
  }

  /** Everything played through `master`, as a MediaStream for the clip recorder. */
  recordStream(): MediaStream | null {
    try {
      if (!this.recDest) {
        this.recDest = this.ctx.createMediaStreamDestination()
        this.master.connect(this.recDest)
      }
      return this.recDest.stream
    } catch {
      return null
    }
  }

  noise(): AudioBuffer {
    if (!this.noiseBuf) {
      const c = this.ctx
      const b = c.createBuffer(1, c.sampleRate, c.sampleRate)
      const d = b.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      this.noiseBuf = b
    }
    return this.noiseBuf
  }
}

export const audio = new AudioSys()

export interface EngineSound {
  /** load: wheel speed as a fraction of top speed; throttle: 0..1 pedal. */
  update(load: number, throttle: number): void
  stop(): void
}

class SynthEngine implements EngineSound {
  private readonly o1: OscillatorNode
  private readonly o2: OscillatorNode
  private readonly lfo: OscillatorNode
  private readonly filter: BiquadFilterNode
  private readonly out: GainNode

  constructor() {
    const c = audio.ctx
    this.o1 = c.createOscillator()
    this.o1.type = 'sawtooth'
    this.o2 = c.createOscillator()
    this.o2.type = 'square'
    const sub = c.createGain()
    sub.gain.value = 0.5
    this.filter = c.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.Q.value = 4
    this.lfo = c.createOscillator()
    const lfoDepth = c.createGain()
    lfoDepth.gain.value = 0.3
    const chug = c.createGain()
    chug.gain.value = 0.7
    this.lfo.connect(lfoDepth).connect(chug.gain)
    this.out = c.createGain()
    this.out.gain.value = 0
    this.o1.connect(this.filter)
    this.o2.connect(sub).connect(this.filter)
    this.filter.connect(chug).connect(this.out).connect(audio.master)
    const t = c.currentTime
    this.o1.start(t)
    this.o2.start(t)
    this.lfo.start(t)
    this.update(0, 0)
  }

  update(load: number, throttle: number): void {
    const t = audio.ctx.currentTime
    const f = 36 + Math.min(1.3, load) * 105 + throttle * 10
    this.o1.frequency.setTargetAtTime(f, t, 0.06)
    this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.06)
    this.lfo.frequency.setTargetAtTime(f / 3, t, 0.06)
    this.filter.frequency.setTargetAtTime(380 + Math.min(1.3, load) * 1500 + throttle * 500, t, 0.06)
    this.out.gain.setTargetAtTime(0.05 + throttle * 0.07 + Math.min(1, load) * 0.05, t, 0.08)
  }

  stop(): void {
    const t = audio.ctx.currentTime
    this.out.gain.setTargetAtTime(0, t, 0.05)
    for (const o of [this.o1, this.o2, this.lfo]) o.stop(t + 0.3)
    setTimeout(() => this.out.disconnect(), 400)
  }
}

class VoiceEngine implements EngineSound {
  private readonly src: AudioBufferSourceNode
  private readonly out: GainNode

  constructor(data: { sampleRate: number; pcm: Float32Array }) {
    const c = audio.ctx
    const buf = c.createBuffer(1, data.pcm.length, data.sampleRate)
    buf.getChannelData(0).set(data.pcm)
    this.src = c.createBufferSource()
    this.src.buffer = buf
    this.src.loop = true
    this.out = c.createGain()
    this.out.gain.value = 0
    this.src.connect(this.out).connect(audio.master)
    this.src.start()
    this.update(0, 0)
  }

  update(load: number, throttle: number): void {
    const t = audio.ctx.currentTime
    this.src.playbackRate.setTargetAtTime(0.6 + Math.min(1.3, load) * 1.35 + throttle * 0.1, t, 0.06)
    this.out.gain.setTargetAtTime(0.16 + throttle * 0.42 + Math.min(1, load) * 0.12, t, 0.07)
  }

  stop(): void {
    const t = audio.ctx.currentTime
    this.out.gain.setTargetAtTime(0, t, 0.05)
    this.src.stop(t + 0.3)
    setTimeout(() => this.out.disconnect(), 400)
  }
}

export function createEngine(data: EngineData): EngineSound {
  return data.kind === 'voice' ? new VoiceEngine(data) : new SynthEngine()
}

function noiseHit(duration: number, volume: number, fromHz: number, toHz: number): void {
  const c = audio.ctx
  const t = c.currentTime
  const src = c.createBufferSource()
  src.buffer = audio.noise()
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.setValueAtTime(fromHz, t)
  f.frequency.exponentialRampToValueAtTime(toHz, t + duration)
  const g = c.createGain()
  g.gain.setValueAtTime(volume, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + duration)
  src.connect(f).connect(g).connect(audio.master)
  src.start(t)
  src.stop(t + duration + 0.05)
}

function tone(freq: number, toFreq: number, start: number, duration: number, volume: number, type: OscillatorType = 'sine'): void {
  const c = audio.ctx
  const t = c.currentTime + start
  const o = c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  o.frequency.exponentialRampToValueAtTime(toFreq, t + duration)
  const g = c.createGain()
  g.gain.setValueAtTime(volume, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + duration)
  o.connect(g).connect(audio.master)
  o.start(t)
  o.stop(t + duration + 0.05)
}

export function sfxLand(impact: number): void {
  noiseHit(0.18, Math.min(0.9, impact / 12), 420, 120)
}

export function sfxCrash(): void {
  noiseHit(0.8, 0.85, 1600, 120)
  tone(120, 38, 0, 0.6, 0.5, 'triangle')
}

export function sfxFlip(): void {
  tone(660, 680, 0, 0.09, 0.25, 'square')
  tone(990, 1000, 0.09, 0.14, 0.25, 'square')
}

export function sfxCoin(): void {
  tone(1320, 1330, 0, 0.06, 0.12, 'square')
  tone(1760, 1770, 0.05, 0.1, 0.12, 'square')
}

export function sfxPickup(): void {
  tone(520, 780, 0, 0.18, 0.25, 'triangle')
}

export function sfxCrack(): void {
  noiseHit(0.12, 0.6, 3000, 600)
}

export function sfxWin(): void {
  ;[523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, i * 0.11, 0.22, 0.25, 'square'))
}
