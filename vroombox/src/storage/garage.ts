import { fromRecord, RECORD_FORMAT, toRecord, type VehicleRecord } from '../vehicle.ts'

const DB_NAME = 'vroombox'
const STORE = 'vehicles'

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(req.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** Records saved by an older version are rebuilt once in the current format and saved back. */
async function upgrade(r: VehicleRecord): Promise<VehicleRecord> {
  if (r.format === RECORD_FORMAT) return r
  const next = await toRecord(await fromRecord(r))
  await saveVehicle(next)
  return next
}

export async function listVehicles(): Promise<VehicleRecord[]> {
  const all = await run<VehicleRecord[]>('readonly', (s) => s.getAll() as IDBRequest<VehicleRecord[]>)
  const current = await Promise.all(all.map((r) => upgrade(r).catch(() => r)))
  return current.sort((a, b) => b.createdAt - a.createdAt)
}

export async function saveVehicle(r: VehicleRecord): Promise<void> {
  await run('readwrite', (s) => s.put(r))
  void navigator.storage?.persist?.().catch(() => {})
}

export async function deleteVehicle(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id))
}
