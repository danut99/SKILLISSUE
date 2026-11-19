import { audio, createEngine, sfxCoin, sfxCrack, sfxCrash, sfxLand, sfxPickup, sfxWin, type EngineSound } from '../audio/audio.ts'
import { CLIP_GAME_VIEW, CLIP_H, CLIP_W, ClipRecorder, clipSupported, drawClipFrame, shareOrSave, type Clip, type ClipInfo } from '../clip/clip.ts'
import {failureDiagnosis} from '../game/failureDiagnosis.ts'
import * as C from '../game/config.ts'
import { ACTIVE_LEVELS, goalMet, type RunSpec } from '../game/modes.ts'
import { Camera, Renderer, type View } from '../game/render.ts'
import { decodeInput, encodeInput, NO_INPUT, Sim, type EndKind, type Input } from '../game/sim.ts'
import { type Upgrades } from '../game/upgrades.ts'
import { t } from '../i18n.ts'
import { upgradesFor, endlessBest, levelTimeOf, pullBestOf, type Outcome, type Reward } from '../progress.ts'
import { autoSizeCanvas, el, toast, vibrate } from '../util/dom.ts'
import { ctx2d, makeCanvas } from '../util/image.ts'
import { loadGhost, saveGhost, vehicleSig, type Ghost } from '../ghost.ts'
import { geomOf, type Vehicle } from '../vehicle.ts'
import { goalLabel, goalProgress, modeLabel, starRow } from './labels.ts'
import type { Screen } from './screen.ts'

export type DriveResume = { distance: number; stars: number; collected: number[] }
export type DriveNav = {
  edit?(checkpoint: DriveResume): void
  workshop?(): void
  menu(): void
  /** Saves the outcome and returns the reward to show. */
  finish(outcome: Outcome): Reward
  play(run: RunSpec): void
}

const HARD_LANDING = 7
const MAX_STEPS_PER_FRAME = 4
const SUCCESS: EndKind[] = ['finish', 'fullpull']

type RunResult = Outcome & { startState: DriveResume; startDistance: number; reward: Reward; inputs: Uint8Array; endStep: number; prevBest: number }

function endTitle(end: EndKind, run: RunSpec): string {
  switch (end) {
    case 'roof':
    case 'flip':
      return t.crashed
    case 'stuck':
      return t.stuck
    case 'bogged':
      return t.bogged
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
      return r.end === 'finish' && !r.resumed ? t.seconds(r.time) : `${Math.floor(r.distance)} / ${finish} m`
    case 'pull':
      return `${r.pulled.toFixed(1)} m`
    case 'delivery':
      return r.end === 'finish' ? `🥚 ${r.eggs}/${r.eggsTotal}` : `${Math.floor(r.distance)} / ${finish} m`
  }
}

export function driveScreen(vehicle: Vehicle, run: RunSpec, nav: DriveNav, resumeAt?: DriveResume, previewUpgrades?: Upgrades): Screen {
  const canvas = el('canvas.game')
  const g = ctx2d(canvas)
  const upgrades: Upgrades = {...(previewUpgrades ?? upgradesFor(vehicle.id))}
  const hasCheckpoints = !!run.track.checkpoints?.length
  let saved: DriveResume = resumeAt ?? { distance: 0, stars: 0, collected: [] }
  let checkpoint = saved.distance
  let resumed = checkpoint > 0
  let attemptStart = checkpoint
  let attemptState = { ...saved, collected: [...saved.collected] }
  const makeSim = () => {
    const fresh = new Sim({ startDistance: attemptStart, geom: geomOf(vehicle), track: run.track, mode: run.mode, upgrades })
    if (run.testDrive) fresh.fuel = Infinity
    fresh.stars = saved.stars
    for (const id of saved.collected) fresh.collected.add(id)
    return fresh
  }
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
  const hudCoins = el('div.pill.coin', { hidden: true })
  const hudExtra = el('div.pill.dim', { hidden: true })
  const speedDigits = el('span.speed-digits', {}, '0')
  const speedFill = el('span.speed-fill')
  const speedometer = el('div.speedometer', { role: 'group', ariaLabel: t.statNames.speed },
    speedDigits, el('span.speed-unit', {}, 'km/h'),
    el('span.speed-scale', { ariaHidden: 'true' }, speedFill))
  const fuelFill = el('div')
  const fuelBar = el('div.fuel', {}, el('span', {}, '⛽'), el('div.fuel-track', {}, fuelFill))
  fuelBar.hidden = run.kind === 'pull' || !!run.testDrive
  const level = run.kind === 'level' ? (ACTIVE_LEVELS.find((l) => String(l.id) === run.ref) ?? null) : null
  const revNeedle = el('div.rev-needle')
  const revLabel = el('span.rev-label', {}, t.revs)
  const revBar = el('div.revs', {}, revLabel, el('div.rev-track', {}, el('div.rev-green'), revNeedle))
  revBar.hidden = run.kind !== 'pull'
  const hint = el('div.drive-hint', {}, t.holdGas)
  const checkpointHint = el('div.checkpoint-hint', { hidden: !hasCheckpoints })
  const gasBtn = el('button.pedal.gas', { type: 'button' }, t.gas)
  const brakeBtn = el('button.pedal.brake', { type: 'button' }, t.brake)
  const pauseBtn = el('button.topbtn.pausebtn', { type: 'button', onclick: () => pauseRun(), title: t.paused, ariaLabel: t.paused }, t.pause)
  const checkpointRetryBtn = el('button.checkpoint-retry', { type: 'button', hidden: !run.track.firstCourse, onclick: () => startRun(), ariaLabel: t.retryAt(checkpoint) }, '↺')
  const soundBtn = el('button.topbtn.soundbtn', { type: 'button', onclick: () => { audio.toggleMute(); updateSound() } })
  function updateSound() { soundBtn.textContent = audio.muted ? '🔇' : '🔊'; soundBtn.setAttribute('aria-label', audio.muted ? t.soundOff : t.soundOn) }
  updateSound()
  const closeBtn = el('button.topbtn', { type: 'button', onclick: () => nav.menu() }, '✕')
  const root = el(
    'div.drive',
    {},
    canvas,
    el('div.hud', {}, el('div.hud-row', {}, hudMain, hudCoins, hudExtra), fuelBar, revBar, checkpointHint),
    hint,
    closeBtn,
    pauseBtn,
    soundBtn,
    checkpointRetryBtn,
    brakeBtn,
    gasBtn,
    speedometer,
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
  let disposed = false
  let paused = false
  let pauseOverlay: HTMLElement | null = null
  let resultTimer = 0
  function clearInput() {
    input.gas = input.brake = false
    gasBtn.classList.remove('on')
    brakeBtn.classList.remove('on')
  }
  function resumeRun() {
    if (disposed || document.hidden || !paused) return
    paused = false
    pauseOverlay?.remove()
    pauseOverlay = null
    clearInput()
    audio.unlock()
    engine = createEngine(vehicle.engine)
    acc = 0
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  function pauseRun() {
    if (!running || paused || disposed) return
    paused = true
    clearInput()
    cancelAnimationFrame(raf)
    engine?.stop()
    engine = null
    pauseOverlay = el('div.pause-overlay', {}, el('div.pause-card', {},
      el('h2', {}, t.paused),
      el('button.btn.big', { type: 'button', onclick: resumeRun }, t.resume),
      hasCheckpoints ? el('button.btn.secondary', { type: 'button', onclick: () => startRun() }, t.retryAt(checkpoint)) : null,
      hasCheckpoints && nav.edit ? el('button.btn.secondary', { type: 'button', onclick: () => nav.edit?.(saved) }, t.editAndRetry) : null,
      el('button.btn.secondary', { type: 'button', onclick: () => nav.menu() }, run.testDrive ? t.workshop : t.menu)))
    root.append(pauseOverlay)
  }
  const onVisibility = () => { if (document.hidden) pauseRun() }
  window.addEventListener('blur', pauseRun)
  document.addEventListener('visibilitychange', onVisibility)
  let lowFuelWarned = false
  let result: { overlay: HTMLElement; cancel(): void } | null = null
  let wakeLock: { release(): Promise<void> } | null = null
  const hudText = { main: '', coins: '', extra: '', speed: '', hint: '' }

  function setText(node: HTMLElement, key: keyof typeof hudText, text: string) {
    if (hudText[key] !== text) {
      hudText[key] = text
      node.textContent = text
      node.hidden = !text
    }
  }

  function updateHud() {
    const speed = Math.round(Math.abs(sim.chassis.getLinearVelocity().x) * 3.6)
    if (String(speed) !== hudText.speed) {
      setText(speedDigits, 'speed', String(speed))
      speedFill.style.transform = `scaleX(${Math.min(1, speed / (C.TOP_SPEED * 3.6))})`
    }
    if (hasCheckpoints) {
      const x = sim.chassis.getPosition().x
      let message = run.testDrive ? t.testDriveFree : sim.time < 4 ? (resumed ? t.checkpointFinishHint : t.levelCheckpointHint) : ''
      for (const segment of sim.track.segmentsIn(x - 40, x + 20)) {
        if (segment.logs.some(log => log.crossing && x >= log.x - 14 && x < log.x + 6)) message = t.logCrossingHint
        const gap = segment.features.find(f => f.kind === 'gap' && x >= f.x - 16 && x < f.x + f.len)
        if (gap) message = gap.gapWidth === 8 ? t.firstJumpHint : t.jumpHint
        if (segment.features.some(f => f.kind === 'ice' && x >= f.x - 12 && x < f.x)) message = t.adviceIce
      }
      setText(checkpointHint, 'hint', message)
    }
    const finish = run.track.finish
    setText(
      hudMain,
      'main',
      run.kind === 'pull' ? `${sim.pulled.toFixed(1)} m` : finish ? `${Math.floor(sim.distance)} / ${finish} m` : t.meters(Math.floor(sim.distance)),
    )
    setText(hudCoins, 'coins', '')
    if (run.kind === 'pull') {
      revNeedle.style.left = `${Math.round(sim.rpm * 100)}%`
      const spinning = sim.rpm > C.RPM_GREEN[1]
      revBar.classList.toggle('spin', spinning)
      revLabel.textContent = spinning ? t.wheelspin : t.revs
    }
    const extra =
      level
        ? `⭐ ${sim.stars}/${level.stars.length}${resumed ? '' : ' · ' + goalProgress(level, sim)}`
        : run.kind === 'delivery'
          ? `🥚 ${sim.eggs.length}/${sim.eggsTotal}`
          : best > 0
            ? `🏆 ${run.kind === 'pull' ? best.toFixed(1) : Math.round(best)} m`
            : ''
    setText(hudExtra, 'extra', extra)
    if (!run.testDrive && sim.fuelMax !== Infinity) {
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
      if (paused || !running) return
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
    if (down && (e.code === 'Escape' || e.code === 'KeyP')) {
      e.preventDefault()
      if (paused) resumeRun(); else pauseRun()
      return
    }
    if (paused) return
    if (GAS_KEYS.includes(e.code)) input.gas = down
    else if (BRAKE_KEYS.includes(e.code)) input.brake = down
    else if (down && e.code === 'KeyR') startRun()
    else return
    if (down) audio.unlock()
    gasBtn.classList.toggle('on', input.gas)
    brakeBtn.classList.toggle('on', input.brake)
    e.preventDefault()
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)

  function startRun(fromBeginning = false) {
    if (disposed) return
    clearTimeout(resultTimer)
    paused = false
    pauseOverlay?.remove()
    pauseOverlay = null
    result?.cancel()
    result?.overlay.remove()
    result = null
    best = bestFor()
    if (sim.stepCount > 0 && !fromBeginning) resumed = checkpoint > 0
    attemptStart = checkpoint
    attemptState = { ...saved, collected: [...saved.collected] }
    sim = makeSim()
    ghost = run.kind === 'level' && !run.testDrive && !resumed ? loadGhost(run.ref, vehicle.id, sig) : null
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
    if (!resumed) toast(ghost ? t.ghostHint : modeLabel(run), 1600)
    last = performance.now()
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(frame)
  }

  function frame(now: number) {
    if (!running || paused || disposed) return
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
      if (hasCheckpoints && !ev.ended && !sim.airborne) {
        const position = sim.chassis.getPosition().x - C.START_X
        const reached = [...(run.track.checkpoints ?? [])].reverse().find(at => position >= at) ?? 0
        if (reached > checkpoint) { checkpoint = reached; saved = { distance: reached, stars: sim.stars, collected: [...sim.collected] }; sfxPickup(); vibrate(25); toast(t.checkpointReached, 2200) }
      }
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
      resumed,
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
    if (run.kind === 'level' && !run.testDrive && !resumed && kind === 'finish') saveGhost(run.ref, vehicle.id, sig, sim.time, upgrades, log.slice(0, sim.stepCount))
    const reward = nav.finish(outcome)
    reward.missions.forEach((m, i) => setTimeout(() => toast(`🎯 ${t.mission(m.kind, m.target)} ✅`, 2200), 900 + i * 1400))
    const res: RunResult = { startState: attemptState, startDistance: attemptStart, ...outcome, reward, inputs: log.slice(0, sim.stepCount), endStep: sim.stepCount, prevBest }
    resultTimer = window.setTimeout(() => {
      if (!disposed && !running && !result) showResult(res)
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
    return parts.join(' · ')
  }

  function showResult(res: RunResult) {
    const clipCanvas = makeCanvas(CLIP_W, CLIP_H)
    const clipView = el('div.clipview', {}, clipCanvas)
    const shareBtn = el('button.btn', { type: 'button', disabled: true }, t.makingClip(0))
    const success = SUCCESS.includes(res.end)
    const advice = !success ? failureAdvice() : ''
    const showStars = !run.testDrive && res.run.kind !== 'endless'
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
        level && success ? el('div.result-goals', {},
          el('div', {}, '★ ', t.finishGoal),
          el('div', {}, res.stars >= level.stars.length ? '★ ' : '☆ ', t.collectedGoal(res.stars, level.stars.length)),
          el('div', {}, !res.resumed && goalMet(level, res) ? '★ ' : '☆ ', res.resumed ? t.checkpointFinishHint : goalLabel(level))) :
          showStars && !level ? el('div.result-stars', {}, starRow(res.reward.stars)) : null,
        el('div.result-sub', {}, advice || subLine(res)),
        hasCheckpoints && !success && nav.edit ? el('button.btn.big', { type: 'button', onclick: () => nav.edit?.(saved) }, t.editAndRetry) : null,

        nextRun && (success || res.reward.stars > 0)
          ? el('button.btn.big', { type: 'button', onclick: () => nav.play(nextRun) }, t.nextRun)
          : null,
        el(
          'div.row',
          {},
          el('button.btn.secondary', { type: 'button', onclick: () => startRun() }, hasCheckpoints ? t.retryAt(checkpoint) : t.retry),
          el('button.btn.ghost', { type: 'button', onclick: () => nav.menu() }, run.testDrive ? t.workshop : t.menu),
        ),
        hasCheckpoints && checkpoint > 0 ? el('button.btn.ghost', { type: 'button', onclick: () => { checkpoint = 0; saved = { distance: 0, stars: 0, collected: [] }; resumed = false; startRun(true) } }, t.trailRestart) : null,
        run.testDrive ? el('div.result-sub', {}, t.testDriveFree) : el('div.result-sub', {}, t.coinsEarned(res.reward.coins)),
        nav.workshop ? el('button.btn.secondary', {type:'button',onclick:nav.workshop},t.workshop) : null,
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
      sub: showStars ? starRow(res.reward.stars) : '',
      slowmo: false,
    }
    if (run.testDrive) {
      shareBtn.remove(); clipView.remove();
      result = {overlay,cancel() {}}
      return
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

  function failureAdvice(): string {
    const diagnosis = failureDiagnosis(sim)
    if(diagnosis) return {'hit-bank':t.hitBank,'fell-gap':t.fellGap,'belly-ground':t.bellyGround,'wheelspin':t.slipping}[diagnosis]
    if (sim.ended === 'bogged') return t.adviceBogged
    if (sim.ended === 'fuel') return t.adviceFuel
    const x = sim.chassis.getPosition().x
    for (const segment of sim.track.segmentsIn(x - 32, x + 3)) {
      if (segment.features.some(f => f.kind === 'gap' && x >= f.x && x < f.x + f.len * 0.65)) return t.jumpHint
    }
    if (sim.ended === 'roof' || sim.ended === 'flip') return t.adviceRoof
    for (const wheel of sim.wheels) {
      const surface = sim.track.surfaceAt(wheel.getPosition().x)
      if (surface === 'mud') return t.adviceMud
      if (surface === 'snow') return t.adviceSnow
      if (surface === 'ice') return t.adviceIce
    }
    if (sim.props.some(p => p.kind === 'log' && Math.abs(p.body.getPosition().x - x) < 3)) return t.logCrossingHint
    for (const segment of sim.track.segmentsIn(x - 3, x + 3)) {
      if (segment.rocks.some(r => Math.abs(r.x - x) < 2 + r.r)) return t.adviceRock
    }
    return t.adviceStuck
  }

  /** Re-simulates the run from the input log and films the last seconds, slow-mo at the end. */
  function playReplay(res: RunResult, clipCanvas: HTMLCanvasElement, info: ClipInfo, onProgress: (pct: number) => void, onDone: (clip: Clip | null) => void) {
    let cancelled = false
    let frameId = 0
    let sound: EngineSound | null = null
    const recorder = new ClipRecorder()
    const rsim = new Sim({ startDistance: res.startDistance, geom: geomOf(vehicle), track: run.track, mode: run.mode, upgrades })
    rsim.stars = res.startState.stars
    for (const id of res.startState.collected) rsim.collected.add(id)
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
      disposed = true
      running = false
      clearTimeout(resultTimer)
      window.removeEventListener('blur', pauseRun)
      document.removeEventListener('visibilitychange', onVisibility)
      pauseOverlay?.remove()
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



