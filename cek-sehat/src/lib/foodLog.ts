/** Food photos analysed today, for the daily missions. */
import { readPref, writePref } from './prefs';
import { dateKey } from './missions';

export interface FoodItem {
  time: number;
  names: string;
  kalori: number;
  karbo: number;
  protein: number;
  lemak: number;
  gula: number;
  asin: boolean;
}

const KEY = 'makanan:log';

export function loadFood(): FoodItem[] {
  try {
    const v = JSON.parse(readPref(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function addFood(item: FoodItem) {
  // keep the last 30 days
  const cutoff = Date.now() - 30 * 864e5;
  writePref(KEY, JSON.stringify([item, ...loadFood().filter((f) => f.time >= cutoff)]));
}

export function foodToday(list: FoodItem[], today = new Date()) {
  const k = dateKey(today);
  const items = list.filter((f) => dateKey(new Date(f.time)) === k);
  return {
    items,
    kalori: items.reduce((s, f) => s + f.kalori, 0),
    karbo: items.reduce((s, f) => s + f.karbo, 0),
    asin: items.some((f) => f.asin),
  };
}
