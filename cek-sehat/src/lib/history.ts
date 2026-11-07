import type { Level } from './classify';
import { GLUCOSE_TIMING_LABEL, type GlucoseTiming } from './classify';

/**
 * Measurement history, stored only in this browser (localStorage).
 * Nothing is sent anywhere.
 */

export type EntryType = 'detak' | 'tekanan' | 'gula' | 'berat' | 'suhu';

export type EntryData =
  | { type: 'detak'; bpm: number; source: 'kamera' | 'manual' }
  | { type: 'tekanan'; sys: number; dia: number }
  | { type: 'gula'; mgdl: number; timing: GlucoseTiming }
  | { type: 'berat'; weightKg: number; heightCm: number; bmi: number }
  | { type: 'suhu'; celsius: number };

export type Entry = EntryData & {
  id: string;
  /** epoch ms */
  time: number;
  label: string;
  level: Level;
};

export const TYPE_LABEL: Record<EntryType, string> = {
  detak: 'Detak jantung',
  tekanan: 'Tekanan darah',
  gula: 'Gula darah',
  berat: 'Berat badan',
  suhu: 'Suhu tubuh',
};

const KEY = 'csm:history:v1';

/** Minimal storage interface so the module can be tested without a browser. */
export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function defaultStore(): KV | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

let store: KV | null = defaultStore();
const memory: { entries: Entry[] } = { entries: [] };
const listeners = new Set<() => void>();

/** Swap the storage backend (tests only). Resets the in-memory copy. */
export function _setStore(s: KV | null) {
  store = s;
  cache = null;
  memory.entries = [];
}

let cache: Entry[] | null = null;

export function loadEntries(): Entry[] {
  if (cache) return cache;
  let list: Entry[] = memory.entries;
  if (store) {
    try {
      const raw = store.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      list = Array.isArray(parsed) ? parsed : [];
    } catch {
      list = [];
    }
  }
  cache = [...list].sort((a, b) => b.time - a.time);
  return cache;
}

function save(list: Entry[]) {
  cache = [...list].sort((a, b) => b.time - a.time);
  memory.entries = cache;
  if (store) {
    try {
      store.setItem(KEY, JSON.stringify(cache));
    } catch {
      /* storage full or blocked: keep the in-memory copy */
    }
  }
  listeners.forEach((l) => l());
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addEntry(data: EntryData, label: string, level: Level, time = Date.now()): Entry {
  const entry = { ...data, id: newId(), time, label, level } as Entry;
  save([entry, ...loadEntries()]);
  return entry;
}

export function deleteEntry(id: string) {
  save(loadEntries().filter((e) => e.id !== id));
}

export function clearEntries() {
  save([]);
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---------------------------------------------------------- formatting */

export function formatValue(e: Entry): string {
  switch (e.type) {
    case 'detak':
      return `${e.bpm} bpm`;
    case 'tekanan':
      return `${e.sys}/${e.dia} mmHg`;
    case 'gula':
      return `${e.mgdl} mg/dL`;
    case 'berat':
      return `${fmtDec(e.weightKg)} kg (IMT ${fmtDec(e.bmi)})`;
    case 'suhu':
      return `${fmtDec(e.celsius)} °C`;
  }
}

export function formatDetail(e: Entry): string {
  switch (e.type) {
    case 'detak':
      return e.source === 'kamera' ? 'Diukur dengan kamera' : 'Diukur dengan alat lain';
    case 'gula':
      return GLUCOSE_TIMING_LABEL[e.timing];
    case 'berat':
      return `Tinggi ${fmtDec(e.heightCm)} cm`;
    default:
      return '';
  }
}

export const fmtDec = (n: number) => String(n).replace('.', ',');

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ----------------------------------------------------------------- CSV */

const LEVEL_LABEL: Record<Level, string> = {
  normal: 'Normal',
  perhatian: 'Perlu perhatian',
  bahaya: 'Segera periksa',
};

function csvCell(v: string | number): string {
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV for a doctor. Semicolon separator and comma decimals, which is what
 * spreadsheet apps set to Indonesian expect; a BOM so Excel reads UTF-8.
 */
export function toCsv(entries: Entry[]): string {
  const header = ['Tanggal', 'Jam', 'Jenis', 'Nilai', 'Satuan', 'Keterangan', 'Kategori', 'Status'];
  const rows = [...entries]
    .sort((a, b) => a.time - b.time)
    .map((e) => {
      const d = new Date(e.time);
      const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
      const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      let value: string;
      let unit: string;
      switch (e.type) {
        case 'detak':
          [value, unit] = [String(e.bpm), 'bpm'];
          break;
        case 'tekanan':
          [value, unit] = [`${e.sys}/${e.dia}`, 'mmHg'];
          break;
        case 'gula':
          [value, unit] = [fmtDec(e.mgdl), 'mg/dL'];
          break;
        case 'berat':
          [value, unit] = [fmtDec(e.weightKg), `kg (IMT ${fmtDec(e.bmi)})`];
          break;
        case 'suhu':
          [value, unit] = [fmtDec(e.celsius), '°C'];
          break;
      }
      return [date, time, TYPE_LABEL[e.type], value, unit, formatDetail(e), e.label, LEVEL_LABEL[e.level]];
    });
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

/* -------------------------------------------------------------- trends */

export interface SeriesPoint {
  time: number;
  values: number[];
}

/** Numeric series for the trend chart; blood pressure has two lines. */
export function seriesFor(entries: Entry[], type: EntryType, days: number, now = Date.now()): SeriesPoint[] {
  const from = now - days * 24 * 60 * 60 * 1000;
  return entries
    .filter((e) => e.type === type && e.time >= from && e.time <= now)
    .sort((a, b) => a.time - b.time)
    .map((e) => {
      switch (e.type) {
        case 'detak':
          return { time: e.time, values: [e.bpm] };
        case 'tekanan':
          return { time: e.time, values: [e.sys, e.dia] };
        case 'gula':
          return { time: e.time, values: [e.mgdl] };
        case 'berat':
          return { time: e.time, values: [e.weightKg] };
        case 'suhu':
          return { time: e.time, values: [e.celsius] };
      }
    });
}
