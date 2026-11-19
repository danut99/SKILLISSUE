import { audio, createEngine } from '../audio/audio.ts'
import { micAvailable, recordEngine } from '../audio/voice.ts'
import { t } from '../i18n.ts'
import { el, toast } from '../util/dom.ts'
import type { EngineData } from '../vehicle.ts'
import type { Screen } from './screen.ts'

export type EngineNav = { back(): void; done(name: string, engine: EngineData): void }

const RECORD_SECONDS = 2.5

export function engineScreen(defaultName: string, initial: EngineData | null, nav: EngineNav): Screen {
  let engine: EngineData = initial ?? { kind: 'synth' }
  let busy = false
  let previewTimer = 0

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
    audio.unlock()
    const sound = createEngine(engine)
    const start = performance.now()
    clearInterval(previewTimer)
    previewTimer = window.setInterval(() => {
      const s = (performance.now() - start) / 1000
      if (s > 2.4) {
        clearInterval(previewTimer)
        sound.stop()
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
    busy = true
    recBtn.classList.add('on')
    recBtn.textContent = t.recording
    try {
      const result = await recordEngine(RECORD_SECONDS, (lvl) => {
        meterFill.style.width = `${Math.round(lvl * 100)}%`
      })
      recBtn.textContent = t.processing
      if (result) {
        engine = result
        toast(t.voiceReady)
        preview()
      } else {
        toast(t.tooQuiet)
      }
    } catch {
      toast(t.micDenied, 2600)
    } finally {
      busy = false
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
  goBtn.onclick = () => {
    if (busy) return
    audio.unlock()
    nav.done(nameInput.value.trim() || defaultName, engine)
  }

  refresh()

  const root = el(
    'div.screen',
    {},
    el(
      'div.wrap',
      {},
      el('div.topbar', {}, el('button.btn.ghost.backbtn', { onclick: () => nav.back() }, t.back), el('h1.title', {}, t.engineTitle)),
      el('label.field', {}, el('span', {}, t.nameLabel), nameInput),
      el('p.hint', {}, t.engineHint),
      el('div.recwrap', {}, recBtn),
      meter,
      status,
      el('div.row', {}, listenBtn, classicBtn),
      goBtn,
      el('p.note', {}, t.privacy),
    ),
  )
  return { el: root, destroy: () => clearInterval(previewTimer) }
}
