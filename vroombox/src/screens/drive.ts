import { audio, createEngine, sfxCoin, sfxCrack, sfxCrash, sfxFlip, sfxLand, sfxPickup, sfxWin, type EngineSound } from '../audio/audio.ts'
import { CLIP_GAME_VIEW, CLIP_H, CLIP_W, ClipRecorder, clipSupported, drawClipFrame, shareOrSave, type Clip, type ClipInfo } from '../clip/clip.ts'
import * as C from '../game/config.ts'
import { LEVELS, type RunSpec } from '../game/modes.ts'
import { Camera, Renderer, type View } from '../game/render.ts'
import { decodeInput, encodeInput, NO_INPUT, Sim, type EndKind, type Input } from '../game/sim.ts'
import type { Upgrades } from '../game/upgrades.ts'
import { t } from '../i18n.ts'
import { endlessBest, levelTimeOf, progress, pullBestOf, type Outcome, type Reward } from '../progress.ts'
import { autoSizeCanvas, el, toast, vibrate } from '../util/dom.ts'
import { ctx2d, makeCanvas } from '../util/image.ts'
import { loadGhost, saveGhost, vehicleSig, type Ghost } from '../ghost.ts'
import { geomOf, type Vehicle } from '../vehicle.ts'
import { goalLabel, goalProgress, modeLabel, starRow } from './labels.ts'
import type { Screen } from './screen.ts'

export type DriveNav = {
  menu(): void
  /** Saves the outcome and returns the reward to show. */
  finish(outcome: Outcome): Reward
  play(run: RunSpec): void
}

const HARD_LANDING = 7
const MAX_STEPS_PER_FRAME = 4
const SUCCESS: EndKind[] = ['finish', 'fullpull']

type RunResult = Outcome & { reward: Reward; inputs: Uint8Array; endStep: number; prevBest: number }

function endTitle(end: EndKind, run: RunSpec): string {
  switch (end) {
    case 'roof':
    case 'flip':
      return t.crashed
    case 'stuck':
      return t.stuck
    case 'fuel':
      return t.noFuel
    case 'finish':
      return run.kind === 'delivery' ? t.delivered : t.finished
    case 'eggs':
      return t.eggsBroken
    case 'stall':
      return t.stalled
    case 'fullpull':
      return t.fullPull
  }
}

function bigText(r: Outcome): string {
  const finish = r.run.track.finish ?? 0
  switch (r.run.kind) {
    case 'endless':
      return t.meters(Math.floor(r.distance))
    case 'level':
      return r.end === 'finish' ? t.seconds(r.time) : `${Math.floor(r.distance)} / ${finish} m`
    case 'pull':
      return `${r.pulled.toFixed(1)} m`
    case 'delivery':
      return r.end === 'finish' ? `🥚 ${r.eggs}/${r.eggsTotal}` : `${Math.floor(r.distance)} / ${finish} m`
  }
}

export function driveScreen(vehicle: Vehicle, run: RunSpec, nav: DriveNav): Screen {
  const canvas = el('canvas.game')
  const g = ctx2d(canvas)
  const upgrades: Upgrades = { ...progress.upgrades }
  const makeSim = () => new Sim({ geom: geomOf(vehicle), track: run.track, mode: run.mode, upgrades })
  const bestFor = () => (run.kind === 'endless' ? endlessBest(vehicle.id, run.track.map) : run.kind === 'pull' ? pullBestOf(run.ref) : 0)
  let best = bestFor()
  let sim = makeSim()
  const sig = vehicleSig(geomOf(vehicle))
  let ghost: Ghost | null = null
  let ghostSim: Sim | null = null
  let renderer = new Renderer(vehicle)
  const cam = new Camera()
  let view: View = { x: 0, y: 0, w: 1, h: 1 }
  const disposeSize = autoSizeCanvas(canvas, (w, h) => {
    view = { x: 0, y: 0, w, h }
    if (sim.stepCount === 0) cam.snap(sim, view)
  })

  const hudMain = el('div.pill', {})
  const hudCoins = el('div.pill.coin', {})
  const hudExtra = el('div.pill.dim', {})
  const fuelFill = el('div')
  const fuelBar = el('div.fuel', {}, el('span', {}, '⛽'), el('div.fuel-track', {}, fuelFill))
  fuelBar.hidden = run.kind === 'pull'
  const level = run.kind === 'level' ? (LEVELS.find((l) => String(l.id) === run.ref) ?? null) : null
  const revNeedle = el('div.rev-needle')
  const revLabel = el('span.rev-label', {}, t.revs)
  const revBar = el('div.revs', {}, revLabel, el('div.rev-track', {}, el('div.rev-green'), revNeedle))
  revBar.hidden = run.kind !== 'pull'
  const hint = el('div.drive-hint', {}, t.holdGas)
  const gasBtn = el('button.pedal.gas', { type: 'button' }, t.gas)
  const brakeBtn = el('button.pedal.brake', { type: 'button' }, t.brake)
  const closeBtn = el('button.topbtn', { type: 'button', onclick: () => nav.menu() }, '✕')
  const root = el(
    'div.drive',
    {},
    canvas,
    el('div.hud', {}, el('div.hud-row', {}, hudMain, hudCoins, hudExtra), fuelBar, revBar),
    hint,
    closeBtn,
    brakeBtn,
    gasBtn,
  )

  const input: Input = { gas: false, brake: false }
  let engine: EngineSound | null = null
  let log = new Uint8Array(60 * 60 * 5)
  let raf = 0
  let last = 0
  let acc = 0
  let load = 0
  let throttle = 0
  let running = false
  let lowFuelWarned = false
  let result: { overlay: HTMLElement; cancel(): void } | null = null
  let wakeLock: { release(): Promise<void> } | null = null
  const hudText = { main: '', coins: '', extra: '' }

  function setText(node: HTMLElement, key: keyof typeof hudText, text: string) {
    if (hudText[key] !== text) {
      hudText[key] = text
      node.textContent = text
      node.hidden = !text
    }
  }

  function updateHud() {
    const finish = run.track.finish
    setText(
      hudMain,
      'main',
      run.kind === 'pull' ? `${sim.pulled.toFixed(1)} m` : finish ? `${Math.floor(sim.distance)} / ${finish} m` : t.meters(Math.floor(sim.distance)),
    )
    setText(hudCoins, 'coins', run.kind === 'pull' ? '' : `🪙 ${sim.coins * C.COIN_VALUE}`)
    if (run.kind === 'pull') {
      revNeedle.style.left = `${Math.round(sim.rpm * 100)}%`
      const spinning = sim.rpm > C.RPM_GREEN[1]
      revBar.classList.toggle('spin', spinning)
      revLabel.textContent = spinning ? t.wheelspin : t.revs
    }
    const extra =
      level
        ? `⭐ ${sim.stars}/${run.track.stars?.length ?? 0} · ${goalProgress(level, sim)}`
        : run.kind === 'delivery'
          ? `🥚 ${sim.eggs.length}/${sim.eggsTotal}`
          : best > 0
            ? `🏆 ${run.kind === 'pull' ? best.toFixed(1) : Math.round(best)} m`
            : ''
    setText(hudExtra, 'extra', extra)
    if (sim.fuelMax !== Infinity) {
      const pct = sim.fuel / sim.fuelMax
      fuelFill.style.width = `${Math.round(pct * 100)}%`
      fuelBar.classList.toggle('low', pct < 0.2)
      if (pct < 0.2 && !lowFuelWarned) {
        lowFuelWarned = true
        toast(t.lowFuel, 1400)
      } else if (pct > 0.3) lowFuelWarned = false
    }
  }

  function bindPedal(btn: HTMLButtonElement, set: (on: boolean) => void) {
    const on = (e: PointerEvent) => {
      e.preventDefault()
      btn.setPointerCapture(e.pointerId)
      audio.unlock()
      set(true)
      btn.classList.add('on')
    }
    const off = () => {
      set(false)
      btn.classList.remove('on')
    }
    btn.addEventListener('pointerdown', on)
    btn.addEventListener('pointerup', off)
    btn.addEventListener('pointercancel', off)
    btn.addEventListener('lostpointercapture', off)
    btn.addEventListener('contextmenu', (e) => e.preventDefault())
  }
  bindPedal(gasBtn, (v) => (input.gas = v))
  bindPedal(brakeBtn, (v) => (input.brake = v))

  const GAS_KEYS = ['ArrowRight', 'ArrowUp', 'KeyD', 'KeyW']
  const BRAKE_KEYS = ['ArrowLeft', 'ArrowDown', 'KeyA', 'KeyS']
  const onKey = (e: KeyboardEvent) => {
    const down = e.type === 'keydown'
    if (GAS_KEYS.includes(e.code)) input.gas = down
    else if (BRAKE_KEYS.includes(e.code)) input.brake = down
    else if (down && e.code === 'KeyR') startRun()
    else if (down && e.code === 'Escape') nav.menu()
    else return
    if (down) audio.unlock()
    gasBtn.classList.toggle('on', input.gas)
    brakeBtn.classList.toggle('on', input.brake)
    e.preventDefault()
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)

  function startRun() {
    result?.cancel()
    result?.overlay.remove()
    result = null
    best = bestFor()
    sim = makeSim()
    ghost = run.kind === 'level' ? loadGhost(run.ref, vehicle.id, sig) : null
    ghostSim = ghost ? new Sim({ geom: geomOf(vehicle), track: run.track, mode: run.mode, upgrades: ghost.upgrades }) : null
    renderer = new Renderer(vehicle)
    cam.snap(sim, view)
    acc = 0
    load = 0
    throttle = 0
    lowFuelWarned = false
    input.gas = false
    input.brake = false
    gasBtn.classList.remove('on')
    brakeBtn.classList.remove('on')
    hint.hidden = false
    engine?.stop()
    engine = createEngine(vehicle.engine)
    running = true
    updateHud()
    toast(level ? `${modeLabel(run)} · ★★★ ${goalLabel(level)}${ghost ? ` · ${t.ghostHint}` : ''}` : modeLabel(run), 2400)
    last = performance.now()
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(frame)
  }

  function frame(now: number) {
    if (!running) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    acc += dt
    let steps = 0
    while (acc >= C.DT && steps < MAX_STEPS_PER_FRAME) {
      if (sim.stepCount >= log.length) {
        const bigger = new Uint8Array(log.length * 2)
        bigger.set(log)
        log = bigger
      }
      log[sim.stepCount] = encodeInput(input)
      const ev = sim.step(input)
      if (ghost && ghostSim && ghostSim.stepCount < ghost.inputs.length) ghostSim.step(decodeInput(ghost.inputs[ghostSim.stepCount]))
      acc -= C.DT
      steps++
      if (ev.coins) sfxCoin()
      if (ev.fuel) {
        sfxPickup()
        toast(t.fuelToast, 900)
      }
      if (ev.star) {
        sfxPickup()
        toast(t.starToast, 900)
        vibrate(20)
      }
      if (ev.eggsLost) {
        sfxCrack()
        toast(t.eggToast, 900)
        vibrate(40)
      }
      if (ev.flip) {
        sfxFlip()
        toast(t.flipToast, 900)
        vibrate(15)
      }
      if (ev.landing > HARD_LANDING) {
        sfxLand(ev.landing)
        vibrate(Math.min(60, Math.round(ev.landing * 3)))
        cam.shake = Math.min(1, ev.landing / 14)
      }
      if (ev.ended) {
        end(ev.ended)
        break
      }
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0
    if (input.gas) hint.hidden = true

    const powered = sim.engineOn && (input.gas || input.brake)
    throttle += ((powered ? 1 : 0) - throttle) * Math.min(1, dt * 8)
    load += ((sim.engineOn ? sim.engineLoad() : 0) - load) * Math.min(1, dt * 10)
    engine?.update(load, throttle)
    cam.follow(sim, view, dt)
    renderer.draw(g, view, cam, sim, run.kind === 'endless' ? best : 0, dt, input.gas ? 1 : 0, ghostSim)
    updateHud()
    if (running) raf = requestAnimationFrame(frame)
  }

  function end(kind: EndKind) {
    running = false
    engine?.stop()
    engine = null
    const success = SUCCESS.includes(kind)
    if (success) sfxWin()
    else if (kind === 'roof' || kind === 'flip' || kind === 'eggs') sfxCrash()
    vibrate(success ? [40, 40, 40] : [80, 40, 160])
    const outcome: Outcome = {
      run,
      vehicleId: vehicle.id,
      end: kind,
      distance: sim.distance,
      time: sim.time,
      coins: sim.coins,
      stars: sim.stars,
      eggs: sim.eggs.length,
      eggsTotal: sim.eggsTotal,
      pulled: sim.pulled,
      flips: sim.flips,
      braked: sim.braked,
    }
    const prevBest = best
    if (run.kind === 'level' && kind === 'finish') saveGhost(run.ref, vehicle.id, sig, sim.time, upgrades, log.slice(0, sim.stepCount))
    const reward = nav.finish(outcome)
    reward.missions.forEach((m, i) => setTimeout(() => toast(`🎯 ${t.mission(m.kind, m.target)} ✅`, 2200), 900 + i * 1400))
    const res: RunResult = { ...outcome, reward, inputs: log.slice(0, sim.stepCount), endStep: sim.stepCount, prevBest }
    setTimeout(() => {
      if (!running && !result) showResult(res)
    }, 650)
  }

  function subLine(res: RunResult): string {
    const r = res.reward
    const parts: string[] = []
    if (res.run.kind === 'endless') parts.push(r.best ? t.newBest : t.bestWas(r.bestValue))
    else if (res.run.kind === 'level') {
      const bt = levelTimeOf(Number(res.run.ref))
      if (r.best && res.end === 'finish') parts.push(t.newBest)
      else if (bt !== null) parts.push(t.bestTime(bt))
    } else if (res.run.kind === 'pull') parts.push(r.best ? t.newBest : t.bestPull(r.bestValue))
    if (res.flips > 0) parts.push(t.flips(res.flips))
    return parts.join(' · ')
  }

  function showResult(res: RunResult) {
    const clipCanvas = makeCanvas(CLIP_W, CLIP_H)
    const clipView = el('div.clipview', {}, clipCanvas)
    const shareBtn = el('button.btn', { type: 'button', disabled: true }, t.makingClip(0))
    const success = SUCCESS.includes(res.end)
    const showStars = res.run.kind !== 'endless'
    let clip: Clip | null = null
    let videoUrl = ''
    const nextRun = res.reward.next
    const overlay = el(
      'div.result',
      {},
      clipView,
      el(
        'div.result-side',
        {},
        el('div.result-title', {}, endTitle(res.end, run)),
        el('div.result-dist', {}, bigText(res)),
        showStars ? el('div.result-stars', {}, starRow(res.reward.stars)) : null,
        el('div.result-sub', {}, subLine(res)),
        el('div.result-coins', {}, t.coinsEarned(res.reward.coins)),
        nextRun && (success || res.reward.stars > 0)
          ? el('button.btn.big', { type: 'button', onclick: () => nav.play(nextRun) }, t.nextRun)
          : null,
        el(
          'div.row',
          {},
          el('button.btn.secondary', { type: 'button', onclick: () => startRun() }, t.retry),
          el('button.btn.ghost', { type: 'button', onclick: () => nav.menu() }, t.menu),
        ),
        shareBtn,
      ),
    )
    root.append(overlay)

    shareBtn.onclick = async () => {
      if (!clip) return
      const slug = vehicle.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'clip'
      await shareOrSave(clip, `vroombox-${slug}-${run.kind}`, t.shareText(vehicle.name, Math.floor(res.distance)))
    }

    const info: ClipInfo = {
      name: vehicle.name,
      label: modeLabel(run),
      big: bigText(res),
      sub: showStars ? starRow(res.reward.stars) : res.flips > 0 ? t.flips(res.flips) : '',
      slowmo: false,
    }
    const replay = playReplay(res, clipCanvas, info, (p) => {
      if (!clip) shareBtn.textContent = t.makingClip(p)
    }, (made) => {
      clip = made
      if (made) {
        videoUrl = URL.createObjectURL(made.blob)
        clipView.replaceChildren(el('video', { src: videoUrl, autoplay: true, loop: true, muted: true, playsInline: true }))
        shareBtn.disabled = false
        const probe = new File([made.blob], `clip.${made.ext}`, { type: made.blob.type })
        const canShareFile = typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] })
        shareBtn.textContent = canShareFile ? t.share : t.saveClip
      } else {
        shareBtn.textContent = t.clipUnsupported
      }
    })
    result = {
      overlay,
      cancel: () => {
        replay.cancel()
        if (videoUrl) URL.revokeObjectURL(videoUrl)
      },
    }
  }

  /** Re-simulates the run from the input log and films the last seconds, slow-mo at the end. */
  function playReplay(res: RunResult, clipCanvas: HTMLCanvasElement, info: ClipInfo, onProgress: (pct: number) => void, onDone: (clip: Clip | null) => void) {
    let cancelled = false
    let frameId = 0
    let sound: EngineSound | null = null
    const recorder = new ClipRecorder()
    const rsim = new Sim({ geom: geomOf(vehicle), track: run.track, mode: run.mode, upgrades })
    const rcam = new Camera()
    const rren = new Renderer(vehicle)
    const gc = ctx2d(clipCanvas)
    const start = Math.max(0, res.endStep - Math.round(C.REPLAY_SECONDS / C.DT))
    const slowFrom = Math.max(start, res.endStep - Math.round(C.SLOWMO_SECONDS / C.DT))
    const end = res.endStep + Math.round(C.REPLAY_TAIL_SECONDS / C.DT)
    const inputAt = (i: number) => (i < res.inputs.length ? decodeInput(res.inputs[i]) : NO_INPUT)
    const success = SUCCESS.includes(res.end)

    const fastForward = () => {
      if (cancelled) return
      const t0 = performance.now()
      while (rsim.stepCount < start && performance.now() - t0 < 8) rsim.step(inputAt(rsim.stepCount))
      if (rsim.stepCount < start) {
        onProgress(Math.round((rsim.stepCount / start) * 25))
        frameId = requestAnimationFrame(fastForward)
        return
      }
      play()
    }

    const play = () => {
      rcam.snap(rsim, CLIP_GAME_VIEW)
      sound = createEngine(vehicle.engine)
      const recording = clipSupported() && recorder.start(clipCanvas)
      let racc = 0
      let rlast = performance.now()
      let rload = 0
      let rthrottle = 0
      let ended = false
      const tick = (now: number) => {
        if (cancelled) return
        const dt = Math.min(0.05, (now - rlast) / 1000)
        rlast = now
        const slow = rsim.stepCount >= slowFrom
        const scale = slow ? C.SLOWMO_SCALE : 1
        racc += dt * scale
        let n = 0
        while (racc >= C.DT && rsim.stepCount < end && n < MAX_STEPS_PER_FRAME) {
          const ev = rsim.step(inputAt(rsim.stepCount))
          if (ev.landing > HARD_LANDING) rcam.shake = Math.min(1, ev.landing / 14)
          if (ev.coins) sfxCoin()
          if (ev.eggsLost) sfxCrack()
          racc -= C.DT
          n++
          if (!ended && rsim.stepCount >= res.endStep) {
            ended = true
            if (success) sfxWin()
            else if (res.end === 'roof' || res.end === 'flip' || res.end === 'eggs') sfxCrash()
          }
        }
        const cur = inputAt(rsim.stepCount)
        const powered = rsim.engineOn && (cur.gas || cur.brake)
        rthrottle += ((powered ? 1 : 0) - rthrottle) * Math.min(1, dt * 8)
        rload += ((rsim.engineOn ? rsim.engineLoad() : 0) - rload) * Math.min(1, dt * 10)
        sound?.update(rload * (slow ? 0.7 : 1), rthrottle)
        rcam.follow(rsim, CLIP_GAME_VIEW, dt * scale)
        info.slowmo = slow
        drawClipFrame(gc, info, (v) => rren.draw(gc, v, rcam, rsim, run.kind === 'endless' ? res.prevBest : 0, dt * scale, cur.gas ? 1 : 0))
        onProgress(25 + Math.round(((rsim.stepCount - start) / Math.max(1, end - start)) * 75))
        if (rsim.stepCount >= end) {
          void finish(recording)
          return
        }
        frameId = requestAnimationFrame(tick)
      }
      frameId = requestAnimationFrame(tick)
    }

    const finish = async (recording: boolean) => {
      sound?.stop()
      sound = null
      const made = recording ? await recorder.stop() : null
      if (!cancelled) onDone(made)
    }

    frameId = requestAnimationFrame(fastForward)
    return {
      cancel() {
        cancelled = true
        cancelAnimationFrame(frameId)
        recorder.abort()
        sound?.stop()
        sound = null
      },
    }
  }

  const coarse = matchMedia('(pointer: coarse)').matches
  const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches
  if (coarse && !standalone && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {})
  const nav2 = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }
  nav2.wakeLock
    ?.request('screen')
    .then((l) => (wakeLock = l))
    .catch(() => {})

  requestAnimationFrame(() => startRun())

  return {
    el: root,
    destroy: () => {
      running = false
      cancelAnimationFrame(raf)
      result?.cancel()
      engine?.stop()
      engine = null
      disposeSize()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      void wakeLock?.release().catch(() => {})
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    },
  }
}
