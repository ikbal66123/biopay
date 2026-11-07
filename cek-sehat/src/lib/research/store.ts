/**
 * Research records (validation study), kept in IndexedDB on this device only.
 * Raw camera signals are ~30 KB each, too big for localStorage.
 * Nothing is uploaded; the researcher exports a file explicitly.
 */

export type RefDevice = 'oksimeter' | 'ekg' | 'jam-pintar' | 'tensimeter' | 'manual';
export type Condition = 'istirahat' | 'setelah-aktivitas';

export const REF_DEVICE_LABEL: Record<RefDevice, string> = {
  oksimeter: 'Oksimeter jari',
  ekg: 'EKG / monitor pasien',
  'jam-pintar': 'Jam tangan pintar',
  tensimeter: 'Tensimeter digital',
  manual: 'Hitung nadi manual',
};

export interface Participant {
  /** anonymous code, never a name */
  code: string;
  ageGroup?: string;
  sex?: 'L' | 'P';
  /** camera PPG accuracy can depend on skin tone, so the study records it (optional) */
  skinTone?: 'terang' | 'sedang' | 'gelap';
}

export interface ResearchRecord {
  id: string;
  time: number;
  participant: Participant;
  condition: Condition;
  ref: { bpm: number; device: RefDevice };
  app: {
    bpm: number | null;
    bpmPeaks: number;
    bpmFft: number;
    quality: number;
    reason?: string;
    channel: 'r' | 'g';
  };
  /** raw samples as [t ms from start, red, green] */
  signal: [number, number, number][];
  userAgent: string;
  appVersion: string;
}

const DB_NAME = 'csm-riset';
const STORE = 'records';

let memory: ResearchRecord[] = [];

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function saveRecord(r: ResearchRecord): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory = [...memory.filter((m) => m.id !== r.id), r];
    return;
  }
  await tx(db, 'readwrite', (s) => s.put(r));
  db.close();
}

export async function listRecords(): Promise<ResearchRecord[]> {
  const db = await openDb();
  if (!db) return [...memory].sort((a, b) => a.time - b.time);
  const all = await tx<ResearchRecord[]>(db, 'readonly', (s) => s.getAll());
  db.close();
  return all.sort((a, b) => a.time - b.time);
}

export async function deleteRecord(id: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory = memory.filter((m) => m.id !== id);
    return;
  }
  await tx(db, 'readwrite', (s) => s.delete(id));
  db.close();
}

export async function clearRecords(): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory = [];
    return;
  }
  await tx(db, 'readwrite', (s) => s.clear());
  db.close();
}

export function newParticipantCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'P-';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function newRecordId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Compact the raw samples: times relative to the first frame, values to 2 decimals. */
export function compactSignal(samples: { t: number; r: number; g?: number }[]): [number, number, number][] {
  const t0 = samples[0]?.t ?? 0;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return samples.map((s) => [Math.round(s.t - t0), r2(s.r), r2(s.g ?? 0)]);
}

/** One row per measurement, without the raw signal (for spreadsheets). */
export function recordsToCsv(records: ResearchRecord[]): string {
  const header = [
    'id',
    'waktu',
    'peserta',
    'kelompok_usia',
    'jenis_kelamin',
    'warna_kulit',
    'kondisi',
    'alat_pembanding',
    'bpm_pembanding',
    'bpm_aplikasi',
    'bpm_puncak',
    'bpm_fft',
    'kualitas',
    'ditolak_karena',
    'kanal',
    'jumlah_frame',
    'perangkat',
  ];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const num = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 10) / 10) : '');
  const rows = records.map((r) => [
    r.id,
    new Date(r.time).toISOString(),
    r.participant.code,
    r.participant.ageGroup,
    r.participant.sex,
    r.participant.skinTone,
    r.condition,
    r.ref.device,
    r.ref.bpm,
    r.app.bpm,
    num(r.app.bpmPeaks),
    num(r.app.bpmFft),
    num(r.app.quality * 100),
    r.app.reason,
    r.app.channel,
    r.signal.length,
    r.userAgent,
  ]);
  return '﻿' + [header, ...rows].map((row) => row.map(esc).join(';')).join('\r\n') + '\r\n';
}
