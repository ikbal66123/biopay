/**
 * Backup file: lets the user move their data to a new phone or a new app
 * address. The AI API key is never included.
 */
import { loadEntries, mergeEntries, type Entry } from './history';
import { loadMeals, mergeMeals, type Meal } from './foodLog';

export const BACKUP_FORMAT = 'cek-sehat-mandiri-cadangan';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  history: Entry[];
  meals: Meal[];
}

export function makeBackup(now = new Date()): Backup {
  return { format: BACKUP_FORMAT, version: 1, exportedAt: now.toISOString(), history: loadEntries(), meals: loadMeals() };
}

export type ParsedBackup = { ok: true; history: unknown[]; meals: unknown[]; exportedAt?: string } | { ok: false; error: string };

export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, error: 'File ini bukan file cadangan Cek Sehat Mandiri.' };
  }
  const d = data as Partial<Backup>;
  if (!d || d.format !== BACKUP_FORMAT) return { ok: false, error: 'File ini bukan file cadangan Cek Sehat Mandiri.' };
  if (d.version !== 1) return { ok: false, error: 'Versi file cadangan tidak dikenal. Perbarui aplikasi lalu coba lagi.' };
  return {
    ok: true,
    history: Array.isArray(d.history) ? d.history : [],
    meals: Array.isArray(d.meals) ? d.meals : [],
    exportedAt: typeof d.exportedAt === 'string' ? d.exportedAt : undefined,
  };
}

/** Restore by merging: nothing already on the phone is removed or overwritten. */
export function restoreBackup(p: Extract<ParsedBackup, { ok: true }>, now = Date.now()) {
  return { history: mergeEntries(p.history), meals: mergeMeals(p.meals, now) };
}
