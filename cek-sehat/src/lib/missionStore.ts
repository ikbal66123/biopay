/** Which missions are done, points and the weekly-check date. Local only. */
import { readPref, writePref } from './prefs';
import { dateKey } from './missions';

type Done = Record<string, string[]>; // date → mission ids

function load(): Done {
  try {
    const v = JSON.parse(readPref('misi:selesai') ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function doneOn(day: Date): Set<string> {
  return new Set(load()[dateKey(day)] ?? []);
}

export function datesWithDone(): Set<string> {
  const d = load();
  return new Set(Object.keys(d).filter((k) => d[k].length));
}

export function toggleMission(day: Date, id: string, points: number): void {
  const d = load();
  const k = dateKey(day);
  const set = new Set(d[k] ?? []);
  const was = set.has(id);
  if (was) set.delete(id);
  else set.add(id);
  d[k] = [...set];
  // keep 60 days
  const keys = Object.keys(d).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - 60))) delete d[old];
  writePref('misi:selesai', JSON.stringify(d));
  writePref('misi:poin', String(Math.max(0, totalPoints() + (was ? -points : points))));
  if (id === 'cek-mingguan') writePref('misi:mingguan', was ? '' : String(day.getTime()));
}

export function totalPoints(): number {
  return Number(readPref('misi:poin') ?? 0) || 0;
}

export function lastWeeklyCheck(): number | undefined {
  const v = Number(readPref('misi:mingguan'));
  return v > 0 ? v : undefined;
}
