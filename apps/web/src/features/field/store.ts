// The field app's memory on the device (IndexedDB): the last snapshot of the sites, and the outbox
// of what was written offline. Every item carries its own id: sending it twice changes nothing on
// the server (idempotency), so a network that drops after the server saved it is harmless.

export interface FieldSnapshot {
  at: string;
  user: { name: string; role: string; canReport: boolean };
  company: { name: string };
  projects: { id: string; code: string; name: string; location: string | null; status: string; progressPct: number; phases: { id: string; name: string; progressPct: number }[] }[];
}

export interface OutboxPhoto {
  id: string;
  blob: Blob;
  mediaType: 'image/jpeg';
  takenAt: string;
  latitude: number | null;
  longitude: number | null;
}

export type OutboxItem =
  | {
      id: string;
      type: 'report';
      createdAt: string;
      attempts: number;
      lastError: string | null;
      payload: { id: string; projectId: string; phaseId: string | null; progressPct: number | null; note: string | null; latitude: number | null; longitude: number | null; takenAt: string };
      photos: OutboxPhoto[];
      audio?: { blob: Blob; mediaType: string; seconds: number } | null;
    }
  | {
      id: string;
      type: 'incident';
      createdAt: string;
      attempts: number;
      lastError: string | null;
      payload: { id: string; projectId: string; kind: string; priority: string; description: string };
      photos: [];
    };

const DB_NAME = 'struo-field';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(name: 'kv' | 'outbox', mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const request = work(tx.objectStore(name));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const saveSnapshot = (snapshot: FieldSnapshot) => withStore('kv', 'readwrite', (store) => store.put(snapshot, 'snapshot'));
export const readSnapshot = () => withStore<FieldSnapshot | undefined>('kv', 'readonly', (store) => store.get('snapshot') as IDBRequest<FieldSnapshot | undefined>);
export const enqueue = (item: OutboxItem) => withStore('outbox', 'readwrite', (store) => store.put(item));
export const outbox = () => withStore<OutboxItem[]>('outbox', 'readonly', (store) => store.getAll() as IDBRequest<OutboxItem[]>);
const remove = (id: string) => withStore('outbox', 'readwrite', (store) => store.delete(id));

/** Asks the browser to keep this storage even when space runs low. */
export async function persist(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* not supported: data stays best-effort */
  }
}

export async function fetchSnapshot(): Promise<FieldSnapshot | null> {
  const response = await fetch('/api/field/snapshot', { credentials: 'same-origin', headers: { accept: 'application/json' } });
  if (response.status === 401 || response.status === 403) throw new Error(response.status === 401 ? 'not_signed_in' : 'no_company');
  if (!response.ok) return null;
  const snapshot = (await response.json()) as FieldSnapshot;
  await saveSnapshot(snapshot);
  return snapshot;
}

let syncing: Promise<{ sent: number; failed: number }> | null = null;

/**
 * Sends the outbox, oldest first. A refusal the server will never accept (4xx other than 401/429)
 * is kept with its error for the person to see; a network error simply waits for the next try.
 */
export function syncOutbox(): Promise<{ sent: number; failed: number }> {
  syncing ??= (async () => {
    let sent = 0;
    let failed = 0;
    try {
      const items = (await outbox()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const item of items) {
        try {
          let response: Response;
          if (item.type === 'report') {
            const body = new FormData();
            body.append('report', JSON.stringify(item.payload));
            body.append(
              'photos',
              JSON.stringify(item.photos.map(({ id, takenAt, latitude, longitude, mediaType }) => ({ id, takenAt, latitude, longitude, mediaType }))),
            );
            for (const photo of item.photos) body.append(`photo:${photo.id}`, photo.blob, `${photo.id}.jpg`);
            if (item.audio) body.append('audio', new Blob([item.audio.blob], { type: item.audio.mediaType }), 'note');
            response = await fetch('/api/field/reports', { method: 'POST', body, credentials: 'same-origin' });
          } else {
            response = await fetch('/api/field/incidents', {
              method: 'POST',
              body: JSON.stringify(item.payload),
              headers: { 'content-type': 'application/json' },
              credentials: 'same-origin',
            });
          }
          if (response.ok) {
            await remove(item.id);
            sent += 1;
          } else {
            failed += 1;
            const reason = ((await response.json().catch(() => ({}))) as { error?: string }).error ?? String(response.status);
            await enqueue({ ...item, attempts: item.attempts + 1, lastError: reason });
            if (response.status === 401) break;
          }
        } catch {
          failed += 1;
          break; // offline: stop here, everything waits for the network
        }
      }
    } finally {
      syncing = null;
    }
    return { sent, failed };
  })();
  return syncing;
}

/** Resizes a photo on the device (max 1600 px, JPEG) so it travels on a 3G network. */
export async function compressPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}
