/** Medicine list, daily schedule and adherence, stored on this device. */
import { readPref, writePref } from './prefs';
import { dateKey } from './missions';

export interface Medicine {
  id: string;
  name: string;
  /** active ingredient(s) */
  ingredient?: string;
  /** e.g. "500 mg" */
  strength?: string;
  timesPerDay: number;
  /** "HH:MM" */
  times: string[];
  withFood?: 'sebelum' | 'sesudah' | 'bersama' | 'bebas';
  /** what the user/doctor said it is for */
  purpose?: string;
  addedAt: number;
}

export const DEFAULT_TIMES: Record<number, string[]> = {
  1: ['07:00'],
  2: ['07:00', '19:00'],
  3: ['07:00', '13:00', '19:00'],
  4: ['06:00', '12:00', '18:00', '22:00'],
};

/** "3x1", "3 x sehari", "2 kali sehari", "tiap 8 jam", "sekali sehari" → times per day (1–4), or null. */
export function parseFrequency(text: string): number | null {
  const t = text.toLowerCase();
  const every = t.match(/(?:tiap|setiap)\s*(\d+)\s*jam/);
  if (every) {
    const n = Math.round(24 / Number(every[1]));
    return n >= 1 && n <= 4 ? n : null;
  }
  if (/\bsekali\b|\bsatu kali\b/.test(t)) return 1;
  const m = t.match(/(\d)\s*(?:x|kali)/);
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n <= 4 ? n : null;
  }
  return null;
}

const KEY_MEDS = 'obat:daftar';
const KEY_LOG = 'obat:log';

export function loadMeds(): Medicine[] {
  try {
    const v = JSON.parse(readPref(KEY_MEDS) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function saveMeds(list: Medicine[]) {
  writePref(KEY_MEDS, JSON.stringify(list));
}

/** log: { "2026-11-08": ["<medId>@07:00", ...] } */
export type DoseLog = Record<string, string[]>;
export function loadDoseLog(): DoseLog {
  try {
    const v = JSON.parse(readPref(KEY_LOG) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
export function saveDoseLog(log: DoseLog) {
  writePref(KEY_LOG, JSON.stringify(log));
}

export interface Dose {
  med: Medicine;
  time: string;
  key: string;
  taken: boolean;
}

export function dosesFor(meds: Medicine[], log: DoseLog, day: Date): Dose[] {
  const taken = new Set(log[dateKey(day)] ?? []);
  return meds
    .flatMap((med) => med.times.map((time) => ({ med, time, key: `${med.id}@${time}`, taken: taken.has(`${med.id}@${time}`) })))
    .sort((a, b) => a.time.localeCompare(b.time));
}

/** Share of scheduled doses taken over the last `days` days (only days after each medicine was added). */
export function adherence(meds: Medicine[], log: DoseLog, today: Date, days = 7): number | null {
  let due = 0;
  let done = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    d.setHours(23, 59, 59, 999);
    const takenSet = new Set(log[dateKey(d)] ?? []);
    for (const m of meds) {
      if (m.addedAt > d.getTime()) continue;
      for (const t of m.times) {
        // today: only doses whose time has passed
        if (i === 0) {
          const [h, mm] = t.split(':').map(Number);
          if (today.getHours() * 60 + today.getMinutes() < h * 60 + mm) continue;
        }
        due++;
        if (takenSet.has(`${m.id}@${t}`)) done++;
      }
    }
  }
  return due ? done / due : null;
}
