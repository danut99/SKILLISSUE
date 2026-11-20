import { audio, createEngine, type EngineSound } from '../audio/audio.ts'
import { micAvailable, recordClip } from '../audio/voice.ts'
import { t } from '../i18n.ts'
import { el, toast } from '../util/dom.ts'
import type { EngineData, VoiceClip } from '../vehicle.ts'
import type { Screen } from './screen.ts'

export type EngineNav = { back(): void; done(name: string, engine: EngineData): Promise<void> }

/** The sounds a voice engine is made of: accelerating is required, the others are optional. */
type Slot = 'gas' | 'idle' | 'decel'
const SLOTS: Slot[] = ['gas', 'idle', 'decel']
const RECORD_SECONDS = 2.5

type VoiceData = Extract<EngineData, { kind: 'voice' }>
const clipOf = (e: EngineData, slot: Slot): VoiceClip | undefined =>
  e.kind !== 'voice' ? undefined : slot === 'gas' ? { sampleRate: e.sampleRate, pcm: e.pcm } : e[slot]

export function engineScreen(defaultName: string, initial: EngineData | null, nav: EngineNav): Screen {
  let engine: EngineData = initial ?? { kind: 'synth' }
  let busy = false
  let previewTimer = 0
  let previewSound: EngineSound | null = null
  let clipSource: AudioBufferSourceNode | null = null
  let disposed = false
  const recording = new AbortController()
  function stopPreview() {
    clearInterval(previewTimer)
    previewSound?.stop()
    previewSound = null
    clipSource?.stop()
    clipSource = null
  }

  const nameInput = el('input.name', { type: 'text', value: defaultName, maxLength: 28 })
  const status = el('p.status', {})
  const meterFill = el('div')
  const meter = el('div.meter', {}, meterFill)
  const listenBtn = el('button.btn.secondary', {}, t.listenAll)
  const classicBtn = el('button.btn.secondary', {}, t.classicEngine)
  const goBtn = el('button.btn.big', {}, t.go)
  const canRecord = micAvailable()

  /** Plays one recorded sound on its own, looped for 1.6 s. */
  function playClip(slot: Slot) {
    const clip = clipOf(engine, slot)
    if (!clip) return
    stopPreview()
    audio.unlock()
    const c = audio.ctx
    const buf = c.createBuffer(1, clip.pcm.length, clip.sampleRate)
    buf.getChannelData(0).set(clip.pcm)
    const src = c.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.connect(audio.master)
    src.start()
    src.stop(c.currentTime + 1.6)
    clipSource = src
  }

  const rows = SLOTS.map((slot) => {
    const state = el('span.note', {})
    const rec = el('button.btn.small', { type: 'button' }, t.record)
    const hear = el('button.btn.secondary.small', { type: 'button', onclick: () => playClip(slot) }, '▶️')
    const remove = slot === 'gas' ? null : el('button.btn.ghost.small', { type: 'button', onclick: () => {
      if (engine.kind !== 'voice') return
      const next: VoiceData = { ...engine }
      delete next[slot as Exclude<Slot, 'gas'>]
      engine = next
      refresh()
    } }, t.removeSound)
    rec.onclick = () => void recordSlot(slot, rec)
    const row = el('div.voice-slot', {},
      el('div.voice-slot-info', {}, el('strong', {}, t.voiceSlots[slot].title), el('span.note', {}, t.voiceSlots[slot].say), state),
      el('div.row', {}, rec, hear, remove))
    return { slot, row, state, rec, hear, remove }
  })

  function refresh() {
    status.textContent = engine.kind === 'voice' ? t.usingVoice : t.usingClassic
    classicBtn.hidden = engine.kind !== 'voice'
    for (const r of rows) {
      const has = !!clipOf(engine, r.slot)
      const locked = r.slot !== 'gas' && engine.kind !== 'voice'
      r.state.textContent = has ? t.slotReady : locked ? t.recordGasFirst : r.slot === 'gas' ? '' : t.slotEmpty
      r.rec.textContent = has ? t.again : t.record
      r.rec.disabled = busy || !canRecord || locked
      r.hear.hidden = !has
      if (r.remove) r.remove.hidden = !has
    }
    listenBtn.disabled = classicBtn.disabled = goBtn.disabled = busy
  }

  function preview() {
    stopPreview()
    audio.unlock()
    const sound = createEngine(engine)
    previewSound = sound
    const start = performance.now()
    previewTimer = window.setInterval(() => {
      // Idle, pull away through the gears, lift off, then roll back to idle.
      const s = (performance.now() - start) / 1000
      if (s > 4.4) {
        stopPreview()
        return
      }
      const gas = s > 0.8 && s < 3
      const load = s < 0.8 ? 0 : s < 3 ? Math.min(1.1, (s - 0.8) / 1.9) : Math.max(0, 1.1 - (s - 3) / 1.2)
      sound.update({ load, throttle: gas ? 1 : 0, reverse: false, airborne: false })
    }, 30)
  }

  if (!canRecord) toast(window.isSecureContext ? t.micDenied : t.micNeedsHttps, 2600)

  async function recordSlot(slot: Slot, btn: HTMLButtonElement) {
    if (busy) return
    stopPreview()
    busy = true
    refresh()
    btn.classList.add('on')
    btn.textContent = `🔴 ${t.voiceSlots[slot].say}`
    try {
      const clip = await recordClip(RECORD_SECONDS, (lvl) => {
        meterFill.style.width = `${Math.round(lvl * 100)}%`
      }, recording.signal)
      if (disposed) return
      if (!clip) {
        toast(t.tooQuiet)
        return
      }
      if (slot === 'gas') engine = engine.kind === 'voice' ? { ...engine, ...clip } : { kind: 'voice', ...clip }
      else if (engine.kind === 'voice') engine = { ...engine, [slot]: clip }
      toast(t.voiceReady)
      playClip(slot)
    } catch {
      if (!disposed) toast(t.micDenied, 2600)
    } finally {
      busy = false
      btn.classList.remove('on')
      meterFill.style.width = '0%'
      if (!disposed) refresh()
    }
  }

  listenBtn.onclick = () => preview()
  classicBtn.onclick = () => {
    engine = { kind: 'synth' }
    refresh()
    preview()
  }
  goBtn.onclick = async () => {
    if (busy) return
    busy = true
    stopPreview()
    refresh()
    goBtn.textContent = t.saving
    try {
      audio.unlock()
      await nav.done(nameInput.value.trim() || defaultName, engine)
    } catch {
      toast(t.saveFailed, 3000)
    } finally {
      busy = false
      goBtn.textContent = t.go
      if (!disposed) refresh()
    }
  }

  refresh()

  const root = el(
    'div.screen',
    {},
    el(
      'div.wrap',
      {},
      el('div.topbar', {}, el('button.btn.ghost.backbtn', { onclick: () => { if (!busy) nav.back() } }, t.back), el('h1.title', {}, t.engineTitle)),
      el('label.field', {}, el('span', {}, t.nameLabel), nameInput),
      status,
      goBtn,
      el('p.hint', {}, t.engineHint),
      ...rows.map((r) => r.row),
      meter,
      el('div.row', {}, listenBtn, classicBtn),
      el('p.note', {}, t.privacy),
    ),
  )
  return { el: root, destroy: () => { disposed = true; recording.abort(); stopPreview() } }
}
