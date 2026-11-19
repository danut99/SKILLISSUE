import { audio, createEngine, type EngineSound } from '../audio/audio.ts'
import { micAvailable, recordEngine } from '../audio/voice.ts'
import { t } from '../i18n.ts'
import { el, toast } from '../util/dom.ts'
import type { EngineData } from '../vehicle.ts'
import type { Screen } from './screen.ts'

export type EngineNav = { back(): void; done(name: string, engine: EngineData): Promise<void> }

const RECORD_SECONDS = 2.5

export function engineScreen(defaultName: string, initial: EngineData | null, nav: EngineNav): Screen {
  let engine: EngineData = initial ?? { kind: 'synth' }
  let busy = false
  let previewTimer = 0
  let previewSound: EngineSound | null = null
  let disposed = false
  const recording = new AbortController()
  function stopPreview() {
    clearInterval(previewTimer)
    previewSound?.stop()
    previewSound = null
  }

  const nameInput = el('input.name', { type: 'text', value: defaultName, maxLength: 28 })
  const status = el('p.status', {})
  const meterFill = el('div')
  const meter = el('div.meter', {}, meterFill)
  const recBtn = el('button.recbtn', {}, t.record)
  const listenBtn = el('button.btn.secondary', {}, t.listen)
  const classicBtn = el('button.btn.secondary', {}, t.classicEngine)
  const goBtn = el('button.btn.big', {}, t.go)

  function refresh() {
    status.textContent = engine.kind === 'voice' ? t.usingVoice : t.usingClassic
    recBtn.textContent = engine.kind === 'voice' ? t.again : t.record
    classicBtn.hidden = engine.kind !== 'voice'
  }

  function preview() {
    stopPreview()
    audio.unlock()
    const sound = createEngine(engine)
    previewSound = sound
    const start = performance.now()
    clearInterval(previewTimer)
    previewTimer = window.setInterval(() => {
      const s = (performance.now() - start) / 1000
      if (s > 2.4) {
        stopPreview()
        return
      }
      const load = s < 1.4 ? s / 1.4 : Math.max(0, 1 - (s - 1.4) / 1.0)
      sound.update(load, s < 1.6 ? 1 : 0)
    }, 30)
  }

  if (!micAvailable()) {
    recBtn.disabled = true
    toast(window.isSecureContext ? t.micDenied : t.micNeedsHttps, 2600)
  }

  recBtn.onclick = async () => {
    if (busy) return
    stopPreview()
    busy = true
    listenBtn.disabled = classicBtn.disabled = goBtn.disabled = true
    recBtn.classList.add('on')
    recBtn.textContent = t.recording
    try {
      const result = await recordEngine(RECORD_SECONDS, (lvl) => {
        meterFill.style.width = `${Math.round(lvl * 100)}%`
      }, recording.signal)
      if (disposed) return
      recBtn.textContent = t.processing
      if (result) {
        engine = result
        toast(t.voiceReady)
        preview()
      } else {
        toast(t.tooQuiet)
      }
    } catch {
      if (disposed) return
      toast(t.micDenied, 2600)
    } finally {
      busy = false
      listenBtn.disabled = classicBtn.disabled = goBtn.disabled = false
      recBtn.classList.remove('on')
      meterFill.style.width = '0%'
      refresh()
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
    goBtn.disabled = recBtn.disabled = listenBtn.disabled = classicBtn.disabled = true
    goBtn.textContent = t.saving
    try {
      audio.unlock()
      await nav.done(nameInput.value.trim() || defaultName, engine)
    } catch {
      toast(t.saveFailed, 3000)
    } finally {
      busy = false
      goBtn.disabled = listenBtn.disabled = classicBtn.disabled = false
      recBtn.disabled = !micAvailable()
      goBtn.textContent = t.go
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
      el('div.recwrap', {}, recBtn),
      meter,
      el('div.row', {}, listenBtn, classicBtn),
      el('p.note', {}, t.privacy),
    ),
  )
  return { el: root, destroy: () => { disposed = true; recording.abort(); stopPreview() } }
}
