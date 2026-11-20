import type { EngineData, VoiceClip } from '../vehicle.ts'
import { ENGINE_PROCESSOR, ENGINE_WORKLET_SOURCE } from './engineWorklet.ts'

class AudioSys {
  private context: AudioContext | null = null
  private out: GainNode | null = null
  private speaker: GainNode | null = null
  muted = (() => { try { return localStorage.getItem('vroombox:muted') === '1' } catch { return false } })()
  /** How many things currently want the speakers quiet (the clip recording still hears everything). */
  private hush = 0
  toggleMute(): void {
    this.muted = !this.muted
    this.applySpeaker()
    try { localStorage.setItem('vroombox:muted', this.muted ? '1' : '0') } catch { /* storage unavailable */ }
  }
  private applySpeaker(): void {
    if (this.speaker) this.speaker.gain.value = this.muted || this.hush > 0 ? 0 : 1
  }
  /** Silences the speakers until the returned function is called; recordings made from `master` keep their sound. */
  silenceSpeakers(): () => void {
    this.hush++
    this.applySpeaker()
    let released = false
    return () => {
      if (released) return
      released = true
      this.hush--
      this.applySpeaker()
    }
  }
  private recDest: MediaStreamAudioDestinationNode | null = null
  /** True once the pulse-engine worklet is loaded; until then (or without AudioWorklet) engines use the simple synth. */
  engineReady = false
  private engineLoading: Promise<void> | null = null

  /** Loads the engine worklet. Safe to call early and repeatedly: the context may stay suspended until a tap. */
  prepareEngine(): Promise<void> {
    if (!this.engineLoading) {
      const c = this.ctx
      const url = URL.createObjectURL(new Blob([ENGINE_WORKLET_SOURCE], { type: 'text/javascript' }))
      this.engineLoading = (c.audioWorklet ? c.audioWorklet.addModule(url) : Promise.reject(new Error('no AudioWorklet')))
        .then(() => { this.engineReady = true })
        .catch(() => { /* older browsers keep the simple synth engine */ })
        .finally(() => URL.revokeObjectURL(url))
    }
    return this.engineLoading
  }
  private noiseBuf: AudioBuffer | null = null

  get ctx(): AudioContext {
    if (!this.context) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.context = new Ctor({ latencyHint: 'interactive' })
      this.out = this.context.createGain()
      this.out.gain.value = 0.9
      this.speaker = this.context.createGain()
      this.speaker.gain.value = this.muted || this.hush > 0 ? 0 : 1
      this.out.connect(this.speaker)
      this.speaker.connect(this.context.destination)
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

/** What the engine sound follows each frame. */
export type EngineInput = {
  /** Wheel rim speed as a fraction of top speed (0..~1.3): spinning wheels in mud count as fast. */
  load: number
  /** Smoothed gas pedal 0..1. */
  throttle: number
  /** Backing up on the brake pedal. */
  reverse: boolean
  /** No wheel on the ground: the engine revs freely. */
  airborne: boolean
}

export interface EngineSound {
  update(input: EngineInput): void
  stop(): void
}

/** Top of each gear as a fraction of top wheel speed. */
const GEARS = [0.3, 0.55, 0.8, 1.3]
const IDLE_RPM = 0.12
/** Lifting off above this rpm counts as engine braking (a darker, slightly burbling note) for a moment. */
const COAST_RPM = 0.5
const COAST_SECONDS = 1.1

/**
 * A small gearbox and tachometer: revs climb quickly on the gas, fall slowly off it, rev freely in the air,
 * and drop when the box shifts up. Shared by the synth and the voice engine so both sound alive.
 */
export class Revs {
  rpm = IDLE_RPM
  gear = 0
  private last = -1
  /** Armed once the pedal has been well down; lifting off from high revs then starts engine braking. */
  private armed = false
  private coastUntil = -1

  /** True while the engine is coasting down from high revs (engine braking). */
  get decel(): boolean {
    return this.coastUntil > this.last
  }

  /** `now` in seconds. Returns whether the box shifted up this frame. */
  step(i: EngineInput, now: number): { shiftedUp: boolean } {
    const dt = this.last < 0 ? 0 : Math.min(0.1, now - this.last)
    this.last = now
    let shiftedUp = false
    if (!i.airborne && !i.reverse) {
      if (this.gear < GEARS.length - 1 && i.load > GEARS[this.gear] * 0.95) {
        this.gear++
        shiftedUp = true
      } else if (this.gear > 0 && i.load < GEARS[this.gear - 1] * 0.7) this.gear--
    }
    if (i.reverse) this.gear = 0
    const inGear = Math.min(1, i.load / GEARS[this.gear])
    const target = i.airborne && i.throttle > 0.5 ? 1
      : i.throttle > 0.1 ? Math.max(inGear, IDLE_RPM + 0.25 * i.throttle)
      : Math.max(IDLE_RPM, inGear * 0.85)
    if (shiftedUp) this.rpm = Math.max(0.3, this.rpm - 0.35)
    const rate = target > this.rpm ? 3.5 : 1.4
    this.rpm += Math.sign(target - this.rpm) * Math.min(Math.abs(target - this.rpm), rate * dt)

    if (i.throttle > 0.6) {
      this.armed = true
      this.coastUntil = -1
    } else if (i.throttle < 0.3 && this.armed) {
      this.armed = false
      if (this.rpm > COAST_RPM) this.coastUntil = now + COAST_SECONDS
    }
    return { shiftedUp }
  }
}

/** A short low clunk as the gearbox shifts up. */
function shiftClunk(): void {
  noiseHit(0.06, 0.25, 900, 200)
  tone(140, 90, 0, 0.07, 0.12, 'triangle')
}

class SynthEngine implements EngineSound {
  private readonly revs = new Revs()
  private readonly o1: OscillatorNode
  private readonly o2: OscillatorNode
  private readonly lfo: OscillatorNode
  private readonly lfoDepth: GainNode
  private readonly filter: BiquadFilterNode
  private readonly out: GainNode
  /** Intake roar: filtered noise that opens up with the throttle. */
  private readonly intake: AudioBufferSourceNode
  private readonly intakeFilter: BiquadFilterNode
  private readonly intakeGain: GainNode
  /** Gearbox whine while reversing. */
  private readonly whine: OscillatorNode
  private readonly whineGain: GainNode

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
    // The firing rhythm: a deep, lumpy putt-putt at idle that smooths out as the revs rise.
    this.lfo = c.createOscillator()
    this.lfoDepth = c.createGain()
    const chug = c.createGain()
    chug.gain.value = 0.6
    this.lfo.connect(this.lfoDepth).connect(chug.gain)
    this.out = c.createGain()
    this.out.gain.value = 0
    this.o1.connect(this.filter)
    this.o2.connect(sub).connect(this.filter)
    this.filter.connect(chug).connect(this.out).connect(audio.master)

    this.intake = c.createBufferSource()
    this.intake.buffer = audio.noise()
    this.intake.loop = true
    this.intakeFilter = c.createBiquadFilter()
    this.intakeFilter.type = 'bandpass'
    this.intakeFilter.Q.value = 1.2
    this.intakeGain = c.createGain()
    this.intakeGain.gain.value = 0
    this.intake.connect(this.intakeFilter).connect(this.intakeGain).connect(audio.master)

    this.whine = c.createOscillator()
    this.whine.type = 'sine'
    this.whineGain = c.createGain()
    this.whineGain.gain.value = 0
    this.whine.connect(this.whineGain).connect(audio.master)

    const t = c.currentTime
    for (const o of [this.o1, this.o2, this.lfo, this.whine]) o.start(t)
    this.intake.start(t)
    this.update({ load: 0, throttle: 0, reverse: false, airborne: false })
  }

  update(i: EngineInput): void {
    const { shiftedUp } = this.revs.step(i, audio.ctx.currentTime)
    if (shiftedUp) shiftClunk()
    const rpm = this.revs.rpm
    // Engine braking: darker, quieter and burbling while the revs fall.
    const coast = this.revs.decel ? 1 : 0
    const t = audio.ctx.currentTime
    const f = 30 + rpm * 125
    this.o1.frequency.setTargetAtTime(f, t, 0.04)
    this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04)
    this.lfo.frequency.setTargetAtTime(f / 4, t, 0.04)
    this.lfoDepth.gain.setTargetAtTime(0.55 - rpm * 0.4 + coast * 0.25, t, 0.08)
    this.filter.frequency.setTargetAtTime(260 + rpm * 1500 * (0.55 + i.throttle * 0.45) * (1 - coast * 0.35), t, 0.05)
    this.out.gain.setTargetAtTime(0.045 + rpm * 0.05 * (1 - coast * 0.3) + i.throttle * 0.05, t, 0.06)
    this.intakeFilter.frequency.setTargetAtTime(700 + rpm * 1800, t, 0.05)
    this.intakeGain.gain.setTargetAtTime(i.throttle * rpm * 0.05, t, 0.06)
    this.whine.frequency.setTargetAtTime(500 + Math.min(1, i.load) * 1100, t, 0.05)
    this.whineGain.gain.setTargetAtTime(i.reverse ? 0.012 + Math.min(1, i.load) * 0.03 : 0, t, 0.06)
  }

  stop(): void {
    const t = audio.ctx.currentTime
    for (const g of [this.out, this.intakeGain, this.whineGain]) g.gain.setTargetAtTime(0, t, 0.05)
    for (const o of [this.o1, this.o2, this.lfo, this.whine]) o.stop(t + 0.3)
    this.intake.stop(t + 0.3)
    setTimeout(() => {
      this.out.disconnect()
      this.intakeGain.disconnect()
      this.whineGain.disconnect()
    }, 400)
  }
}

type VoiceData = Extract<EngineData, { kind: 'voice' }>

function toBuffer(clip: VoiceClip): AudioBuffer {
  const buf = audio.ctx.createBuffer(1, clip.pcm.length, clip.sampleRate)
  buf.getChannelData(0).set(clip.pcm)
  return buf
}

/**
 * The player's own engine: idle, accelerating and decelerating loops crossfaded by the revs and the pedal,
 * Missing sounds fall back to the accelerating loop.
 */
class VoiceEngine implements EngineSound {
  private readonly revs = new Revs()
  private readonly loops: { src: AudioBufferSourceNode; gain: GainNode }[] = []
  private readonly gas: { src: AudioBufferSourceNode; gain: GainNode }
  private readonly idle: { src: AudioBufferSourceNode; gain: GainNode }
  private readonly decel: { src: AudioBufferSourceNode; gain: GainNode }
  private readonly out: GainNode

  constructor(data: VoiceData) {
    const c = audio.ctx
    this.out = c.createGain()
    this.out.connect(audio.master)
    const gasBuf = toBuffer(data)
    const loop = (buf: AudioBuffer) => {
      const src = c.createBufferSource()
      src.buffer = buf
      src.loop = true
      const gain = c.createGain()
      gain.gain.value = 0
      src.connect(gain).connect(this.out)
      src.start()
      const l = { src, gain }
      this.loops.push(l)
      return l
    }
    this.gas = loop(gasBuf)
    this.idle = loop(data.idle ? toBuffer(data.idle) : gasBuf)
    this.decel = loop(data.decel ? toBuffer(data.decel) : gasBuf)
    this.update({ load: 0, throttle: 0, reverse: false, airborne: false })
  }

  update(i: EngineInput): void {
    const { shiftedUp } = this.revs.step(i, audio.ctx.currentTime)
    if (shiftedUp) shiftClunk()
    const rpm = this.revs.rpm
    const t = audio.ctx.currentTime
    // How much the revs are above idle (0 at idle, 1 by mid revs).
    const up = Math.min(1, Math.max(0, (rpm - 0.15) / 0.3))
    const off = 1 - i.throttle
    const weights = [
      [this.gas, i.throttle, 0.55 + rpm * 1.5],
      [this.idle, off * (1 - up), 0.85 + rpm * 0.8],
      [this.decel, off * up, 0.6 + rpm * 1.3],
    ] as const
    for (const [l, w, rate] of weights) {
      l.gain.gain.setTargetAtTime(w * (0.3 + i.throttle * 0.3 + rpm * 0.15), t, 0.06)
      l.src.playbackRate.setTargetAtTime(rate, t, 0.05)
    }
  }

  stop(): void {
    const t = audio.ctx.currentTime
    this.out.gain.setTargetAtTime(0, t, 0.05)
    for (const l of this.loops) l.src.stop(t + 0.3)
    setTimeout(() => this.out.disconnect(), 400)
  }
}

/** Turns a 0..1 rev fraction into crankshaft rpm. */
const IDLE_CRANK = 800
const REDLINE_CRANK = 6200

/**
 * The built-in engine: combustion pulses from the worklet, shaped by an exhaust (two resonances), a soft
 * overdrive that growls harder on the gas, and a lowpass that opens with the revs; plus intake roar on the gas
 * and gearbox whine in reverse.
 */
class PulseEngine implements EngineSound {
  private readonly revs = new Revs()
  private readonly node: AudioWorkletNode
  private readonly drive: GainNode
  private readonly tone: BiquadFilterNode
  private readonly out: GainNode
  private readonly intake: AudioBufferSourceNode
  private readonly intakeFilter: BiquadFilterNode
  private readonly intakeGain: GainNode
  private readonly whine: OscillatorNode
  private readonly whineGain: GainNode

  constructor() {
    const c = audio.ctx
    this.node = new AudioWorkletNode(c, ENGINE_PROCESSOR, { numberOfInputs: 0, outputChannelCount: [1], processorOptions: { cylinders: 4, seed: 11, thump: 70 } })
    const low = c.createBiquadFilter()
    low.type = 'peaking'
    low.frequency.value = 110
    low.Q.value = 1.1
    low.gain.value = 9
    const mid = c.createBiquadFilter()
    mid.type = 'peaking'
    mid.frequency.value = 330
    mid.Q.value = 1.8
    mid.gain.value = 5
    this.drive = c.createGain()
    const shaper = c.createWaveShaper()
    const curve = new Float32Array(1024)
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 2.2)
    shaper.curve = curve
    shaper.oversample = '2x'
    this.tone = c.createBiquadFilter()
    this.tone.type = 'lowpass'
    this.tone.Q.value = 0.7
    this.out = c.createGain()
    this.out.gain.value = 0
    this.node.connect(low).connect(mid).connect(this.drive).connect(shaper).connect(this.tone).connect(this.out).connect(audio.master)

    this.intake = c.createBufferSource()
    this.intake.buffer = audio.noise()
    this.intake.loop = true
    this.intakeFilter = c.createBiquadFilter()
    this.intakeFilter.type = 'bandpass'
    this.intakeFilter.Q.value = 0.9
    this.intakeGain = c.createGain()
    this.intakeGain.gain.value = 0
    this.intake.connect(this.intakeFilter).connect(this.intakeGain).connect(audio.master)
    this.whine = c.createOscillator()
    this.whine.type = 'sine'
    this.whineGain = c.createGain()
    this.whineGain.gain.value = 0
    this.whine.connect(this.whineGain).connect(audio.master)
    this.intake.start()
    this.whine.start()
    this.update({ load: 0, throttle: 0, reverse: false, airborne: false })
  }

  update(i: EngineInput): void {
    const { shiftedUp } = this.revs.step(i, audio.ctx.currentTime)
    if (shiftedUp) shiftClunk()
    const rpm = this.revs.rpm
    const coast = this.revs.decel ? 1 : 0
    const t = audio.ctx.currentTime
    const p = this.node.parameters
    p.get('rpm')?.setTargetAtTime(IDLE_CRANK + rpm * (REDLINE_CRANK - IDLE_CRANK), t, 0.03)
    p.get('throttle')?.setTargetAtTime(i.throttle, t, 0.03)
    // A little lumpiness at idle and a soft burble while coasting down from high revs.
    p.get('misfire')?.setTargetAtTime(coast ? 0.12 : rpm < 0.2 ? 0.04 : 0, t, 0.05)
    this.drive.gain.setTargetAtTime(1.2 + i.throttle * 2.2 + rpm * 0.8, t, 0.05)
    this.tone.frequency.setTargetAtTime(420 + rpm * 2600 * (0.55 + i.throttle * 0.45) * (1 - coast * 0.3), t, 0.05)
    this.out.gain.setTargetAtTime(0.2 + rpm * 0.12 + i.throttle * 0.1, t, 0.05)
    this.intakeFilter.frequency.setTargetAtTime(500 + rpm * 1600, t, 0.05)
    this.intakeGain.gain.setTargetAtTime(i.throttle * (0.01 + rpm * 0.035), t, 0.06)
    this.whine.frequency.setTargetAtTime(500 + Math.min(1, i.load) * 1100, t, 0.05)
    this.whineGain.gain.setTargetAtTime(i.reverse ? 0.012 + Math.min(1, i.load) * 0.03 : 0, t, 0.06)
  }

  stop(): void {
    const t = audio.ctx.currentTime
    for (const g of [this.out, this.intakeGain, this.whineGain]) g.gain.setTargetAtTime(0, t, 0.05)
    this.intake.stop(t + 0.3)
    this.whine.stop(t + 0.3)
    setTimeout(() => {
      this.node.port.postMessage('stop')
      this.node.disconnect()
      this.out.disconnect()
      this.intakeGain.disconnect()
      this.whineGain.disconnect()
    }, 400)
  }
}

export function createEngine(data: EngineData): EngineSound {
  if (data.kind === 'voice') return new VoiceEngine(data)
  return audio.engineReady ? new PulseEngine() : new SynthEngine()
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

/** Drawbridge warning: two quick beeps before it lifts, a low tone as it goes up. */
export function sfxBridgeWarn(lifting: boolean): void {
  if (lifting) tone(330, 220, 0, 0.35, 0.22, 'triangle')
  else [0, 0.16].forEach((at) => tone(880, 880, at, 0.1, 0.18, 'square'))
}

export function sfxCrack(): void {
  noiseHit(0.12, 0.6, 3000, 600)
}

export function sfxWin(): void {
  ;[523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, i * 0.11, 0.22, 0.25, 'square'))
}
