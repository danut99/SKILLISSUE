import { t } from '../i18n.ts'
import { endlessBest } from '../progress.ts'
import { sampleVehicles } from '../samples.ts'
import { deleteVehicle, listVehicles } from '../storage/garage.ts'
import { el, toast } from '../util/dom.ts'
import { drawVehicleThumb, fromRecord, type Vehicle } from '../vehicle.ts'
import { topBar } from './menu.ts'
import type { Screen } from './screen.ts'

export type GarageNav = {
  back(): void
  newVehicle(): void
  select(v: Vehicle): void
  deleted(id: string): void
}

export function garageScreen(selectedId: string, nav: GarageNav): Screen {
  const urls: string[] = []
  const bestLabel = (id: string) => {
    const b = endlessBest(id, 'farm')
    return b > 0 ? t.best(b) : t.notPlayed
  }
  const card = (id: string, name: string, image: HTMLElement, onClick: () => void) =>
    el(
      `button.vcard${id === selectedId ? '.selected' : ''}`,
      { type: 'button', onclick: onClick, dataset: { id } },
      image,
      el('span.name', {}, name),
      el('span.best', {}, bestLabel(id)),
    )

  const mine = el('div.card-grid')
  const emptyNote = el('p.note', {}, t.emptyGarage)
  const samples = el(
    'div.card-grid',
    {},
    ...sampleVehicles().map((v) => card(v.id, v.name, drawVehicleThumb(v), () => nav.select(v))),
  )

  async function load() {
    try {
      const records = await listVehicles()
      mine.replaceChildren()
      emptyNote.hidden = records.length > 0
      for (const r of records) {
        const url = URL.createObjectURL(r.thumb)
        urls.push(url)
        const c = card(r.id, r.name, el('img', { src: url, alt: r.name }), async () => {
          c.disabled = true
          try {
            nav.select(await fromRecord(r))
          } catch {
            c.disabled = false
            toast(t.loadFailed)
          }
        })
        c.append(
          el(
            'span.del',
            {
              title: t.remove,
              role: 'button',
              onclick: async (e: MouseEvent) => {
                e.stopPropagation()
                if (!confirm(t.confirmDelete(r.name))) return
                await deleteVehicle(r.id)
                nav.deleted(r.id)
                void load()
              },
            },
            '✕',
          ),
        )
        mine.append(c)
      }
    } catch {
      emptyNote.hidden = false
    }
  }
  void load()

  const root = el(
    'div.screen',
    {},
    el(
      'div.wrap',
      {},
      topBar(t.chooseVehicle, nav.back),
      el('button.btn.big', { type: 'button', onclick: () => nav.newVehicle() }, t.newVehicle),
      el('h2.section-title', {}, t.yourVehicles),
      emptyNote,
      mine,
      el('h2.section-title', {}, t.readyMade),
      samples,
      el('p.note', {}, t.privacy),
    ),
  )
  return { el: root, destroy: () => urls.forEach((u) => URL.revokeObjectURL(u)) }
}
