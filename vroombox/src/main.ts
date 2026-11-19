import { registerSW } from 'virtual:pwa-register'
import { endlessRun, type RunSpec } from './game/modes.ts'
import { lang, randomName, t } from './i18n.ts'
import { noteDrawn, progress, recordRun, saveProgress } from './progress.ts'
import { sampleVehicles } from './samples.ts'
import { drawScreen, newSketch, sketchOf, type Sketch } from './screens/draw.ts'
import { driveScreen } from './screens/drive.ts'
import { engineScreen } from './screens/engine.ts'
import { garageScreen } from './screens/garage.ts'
import { homeScreen } from './screens/home.ts'
import { deliveryScreen, endlessScreen, levelsScreen, pullScreen } from './screens/modes.ts'
import type { Screen } from './screens/screen.ts'
import { workshopScreen } from './screens/workshop.ts'
import { listVehicles, saveVehicle } from './storage/garage.ts'
import './styles.css'
import { toast } from './util/dom.ts'
import { canvasToBlob } from './util/image.ts'
import { finalize, type Drawing } from './util/objectimage.ts'
import { fromRecord, newId, toRecord, type EngineData, type Vehicle } from './vehicle.ts'

registerSW({ immediate: true })
document.documentElement.lang = lang

type InstallEvent = Event & { prompt(): Promise<void> }
let installEvent: InstallEvent | null = null

const app = document.getElementById('app') as HTMLElement
let current: Screen | null = null
let onHome = false
let vehicle: Vehicle = sampleVehicles()[0]
/**
 * What the editor is working on: the sketch and, when editing a saved vehicle, that vehicle.
 * Kept until the vehicle is built, so going back never loses the drawing.
 */
let draft: { sketch: Sketch; editing: Vehicle | null } | null = null

function show(next: Screen, home = false) {
  current?.destroy?.()
  current = next
  onHome = home
  app.replaceChildren(next.el)
  window.scrollTo(0, 0)
}

function select(v: Vehicle) {
  vehicle = v
  progress.selected = v.id
  saveProgress()
}

async function restoreSelected() {
  const id = progress.selected
  if (!id) return
  const sample = sampleVehicles().find((v) => v.id === id)
  if (sample) {
    vehicle = sample
    return
  }
  try {
    const rec = (await listVehicles()).find((r) => r.id === id)
    if (rec) vehicle = await fromRecord(rec)
  } catch {
    /* keep the default */
  }
}

/** A vehicle from the editor; when it is an edit, it keeps the edited vehicle's id (and so its records). */
function buildVehicle(drawing: Drawing, name: string, engine: EngineData, edited: Vehicle | null): Vehicle {
  const done = finalize(drawing)
  return {
    id: edited?.id ?? newId(),
    name,
    sample: false,
    createdAt: edited?.createdAt ?? Date.now(),
    sprite: done.sprite,
    outline: done.outline,
    wheels: done.wheels,
    wheelStyle: 'own',
    wheelSprites: done.wheelSprites,
    wheelDesigns: done.wheelDesigns,
    engine,
  }
}

/** Saves the vehicle together with its drawing, so it can be edited later. */
async function saveWithSketch(v: Vehicle, sketch: Sketch | null): Promise<void> {
  if (sketch) {
    const wheels = sketch.wheels.map((w) => ({ ...w, look: { ...w.look } }))
    v.draft = { layer: await canvasToBlob(sketch.layer), wheels }
  }
  await saveVehicle(await toRecord(v))
}

async function install() {
  const e = installEvent
  if (!e) return
  installEvent = null
  await e.prompt().catch(() => {})
  go.home()
}

function play(run: RunSpec, back: () => void) {
  show(driveScreen(vehicle, run, { menu: back, finish: recordRun, play: (next) => play(next, back) }))
}

const go = {
  home() {
    show(
      homeScreen(vehicle, {
        garage: go.garage,
        newVehicle: go.newVehicle,
        edit: vehicle.sample ? null : () => void go.edit(vehicle),
        levels: go.levels,
        endless: go.endless,
        pull: go.pull,
        delivery: go.delivery,
        workshop: go.workshop,
        install: installEvent ? install : null,
      }),
      true,
    )
  },
  garage() {
    show(
      garageScreen(vehicle.id, {
        back: go.home,
        newVehicle: go.newVehicle,
        select: (v) => {
          select(v)
          go.home()
        },
        deleted: (id) => {
          if (vehicle.id === id) select(sampleVehicles()[0])
        },
      }),
    )
  },
  levels() {
    show(levelsScreen({ back: go.home, play: (run) => play(run, go.levels) }))
  },
  endless() {
    show(endlessScreen(vehicle.id, { back: go.home, play: (run) => play(run, go.endless) }))
  },
  pull() {
    show(pullScreen({ back: go.home, play: (run) => play(run, go.pull) }))
  },
  delivery() {
    show(deliveryScreen({ back: go.home, play: (run) => play(run, go.delivery) }))
  },
  workshop() {
    show(workshopScreen({ back: go.home }))
  },
  newVehicle() {
    if (!draft || draft.editing) draft = { sketch: newSketch(), editing: null }
    go.draw()
  },
  async edit(v: Vehicle) {
    try {
      draft = { sketch: await sketchOf(v), editing: v }
      go.draw()
    } catch {
      toast(t.loadFailed)
    }
  },
  draw() {
    const current = (draft ??= { sketch: newSketch(), editing: null })
    show(drawScreen(current.sketch, { back: go.home, next: (drawing) => go.engine(drawing) }))
  },
  engine(drawing: Drawing) {
    const edited = draft?.editing ?? null
    show(
      engineScreen(edited?.name ?? randomName(), edited?.engine ?? null, {
        back: go.draw,
        done: (finalName, finalEngine) => {
          const v = buildVehicle(drawing, finalName, finalEngine, edited)
          const sketch = draft?.sketch ?? null
          draft = null
          const paid = noteDrawn()
          if (paid) toast(t.missionPaid(paid), 2200)
          select(v)
          play(endlessRun('farm'), go.home)
          void saveWithSketch(v, sketch).catch(() => toast(t.saveFailed))
        },
      }),
    )
  },
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installEvent = e as InstallEvent
  if (onHome) go.home()
})
window.addEventListener('appinstalled', () => {
  installEvent = null
  if (onHome) go.home()
})

void restoreSelected().then(() => go.home())
