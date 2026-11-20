/** Meals saved from "Foto Makanan", kept 30 days on this device only. */
import type { KV } from './history';
import type { PerPorsi } from './nutrition';

export interface Meal {
  id: string;
  /** epoch ms */
  time: number;
  /** e.g. "Nasi putih, Ayam goreng" */
  names: string;
  /** portion the user picked (0.5 = ½ piring) */
  portion: number;
  /** nutrition for the eaten portion (already scaled) */
  gizi: PerPorsi;
}

const KEY = 'csm:makanan:v1';
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const NUTRIENTS: (keyof PerPorsi)[] = [
  'kalori',
  'karbohidrat_g',
  'gula_g',
  'serat_g',
  'protein_g',
  'lemak_g',
  'lemak_jenuh_g',
  'natrium_mg',
  'kolesterol_mg',
];

function defaultStore(): KV | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
let store: KV | null = defaultStore();
let memory: Meal[] = [];
const listeners = new Set<() => void>();
let cache: Meal[] | null = null;

export function _setMealStore(s: KV | null) {
  store = s;
  memory = [];
  cache = null;
}

export function isMeal(x: unknown): x is Meal {
  const m = x as Record<string, unknown>;
  if (!m || typeof m !== 'object' || typeof m.id !== 'string' || typeof m.names !== 'string') return false;
  if (typeof m.time !== 'number' || !Number.isFinite(m.time) || typeof m.portion !== 'number' || !(m.portion > 0)) return false;
  const g = m.gizi as Record<string, unknown>;
  return !!g && NUTRIENTS.every((k) => typeof g[k] === 'number' && Number.isFinite(g[k] as number) && (g[k] as number) >= 0);
}

export function loadMeals(): Meal[] {
  if (cache) return cache;
  let list: Meal[] = memory;
  if (store) {
    try {
      const v = JSON.parse(store.getItem(KEY) ?? '[]');
      list = Array.isArray(v) ? v.filter(isMeal) : [];
    } catch {
      list = [];
    }
  }
  cache = [...list].sort((a, b) => b.time - a.time);
  return cache;
}

function save(list: Meal[], now = Date.now()) {
  cache = list.filter((m) => m.time >= now - KEEP_MS).sort((a, b) => b.time - a.time);
  memory = cache;
  if (store) {
    try {
      store.setItem(KEY, JSON.stringify(cache));
    } catch {
      /* storage full: keep in memory */
    }
  }
  listeners.forEach((l) => l());
}

export function addMeal(names: string, portion: number, gizi: PerPorsi, time = Date.now()): Meal {
  const meal: Meal = { id: `${time.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, time, names, portion, gizi };
  save([meal, ...loadMeals()], Math.max(Date.now(), time));
  return meal;
}

export function deleteMeal(id: string) {
  save(loadMeals().filter((m) => m.id !== id));
}

/** Add meals from a backup (skips ones already present). Returns how many were added. */
export function mergeMeals(incoming: unknown[], now = Date.now()): number {
  const have = new Set(loadMeals().map((m) => m.id));
  const fresh = incoming.filter(isMeal).filter((m) => !have.has(m.id) && m.time >= now - KEEP_MS);
  if (fresh.length) save([...loadMeals(), ...fresh], now);
  return fresh.length;
}

export function subscribeMeals(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function sameDay(a: number, b: number) {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

export function mealsOn(list: Meal[], day: number): Meal[] {
  return list.filter((m) => sameDay(m.time, day));
}

/** Sum of every nutrient over the given meals. */
export function totals(list: Meal[]): PerPorsi {
  const t = Object.fromEntries(NUTRIENTS.map((k) => [k, 0])) as PerPorsi;
  for (const m of list) for (const k of NUTRIENTS) t[k] = Math.round((t[k] + m.gizi[k]) * 10) / 10;
  return t;
}
