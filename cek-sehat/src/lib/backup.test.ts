import { beforeEach, describe, expect, it } from 'vitest';
import { _setStore, addEntry, isEntry, loadEntries, type KV } from './history';
import { _setMealStore, addMeal, loadMeals, mealsOn, totals } from './foodLog';
import { BACKUP_FORMAT, makeBackup, parseBackup, restoreBackup } from './backup';

const kv = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};
const gizi = { kalori: 500, karbohidrat_g: 60, gula_g: 20, serat_g: 3, protein_g: 20, lemak_g: 18, lemak_jenuh_g: 5, natrium_mg: 900, kolesterol_mg: 60 };
const NOW = new Date(2026, 10, 20, 19, 0).getTime();

beforeEach(() => {
  _setStore(kv());
  _setMealStore(kv());
});

describe('catatan makan', () => {
  it('menjumlahkan gizi makan hari ini saja', () => {
    addMeal('Nasi goreng', 1, gizi, NOW - 3600e3);
    addMeal('Es teh manis', 1, { ...gizi, kalori: 90, gula_g: 22.5, natrium_mg: 5 }, NOW - 1800e3);
    addMeal('Kemarin', 1, gizi, NOW - 864e5);
    const today = mealsOn(loadMeals(), NOW);
    expect(today.map((m) => m.names)).toEqual(['Es teh manis', 'Nasi goreng']);
    const t = totals(today);
    expect(t.kalori).toBe(590);
    expect(t.gula_g).toBe(42.5);
    expect(t.natrium_mg).toBe(905);
  });
});

describe('cadangan data', () => {
  it('simpan lalu pulihkan di HP lain', () => {
    addEntry({ type: 'tekanan', sys: 130, dia: 85 }, 'Tinggi tahap 1', 'perhatian', NOW);
    addMeal('Soto ayam', 1, gizi, NOW);
    const text = JSON.stringify(makeBackup());

    // "new phone": empty storage
    _setStore(kv());
    _setMealStore(kv());
    const p = parseBackup(text);
    if (!p.ok) throw new Error(p.error);
    expect(restoreBackup(p, NOW)).toEqual({ history: 1, meals: 1 });
    expect(loadEntries()[0]).toMatchObject({ type: 'tekanan', sys: 130 });
    expect(loadMeals()[0].names).toBe('Soto ayam');

    // restoring twice adds nothing
    expect(restoreBackup(p, NOW)).toEqual({ history: 0, meals: 0 });
  });

  it('tidak menyertakan API key', () => {
    expect(JSON.stringify(makeBackup())).not.toMatch(/sk-ant|kunci|apiKey/i);
  });

  it('menolak file lain dan data rusak', () => {
    expect(parseBackup('bukan json').ok).toBe(false);
    expect(parseBackup('{"a":1}').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 9 })).ok).toBe(false);
    const p = parseBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: 1,
        history: [
          { id: 'x', type: 'tekanan', sys: 'abc', dia: 80, time: NOW, label: 'x', level: 'normal' },
          { id: 'y', type: 'suhu', celsius: 36.8, time: NOW, label: 'Normal', level: 'normal' },
          { id: 'z', type: 'aneh', time: NOW, label: '', level: 'normal' },
        ],
        meals: [{ id: 'm', names: 'x', time: NOW, portion: 1, gizi: { kalori: 'banyak' } }],
      }),
    );
    if (!p.ok) throw new Error();
    expect(restoreBackup(p, NOW)).toEqual({ history: 1, meals: 0 });
  });

  it('validasi entri riwayat', () => {
    expect(isEntry({ id: 'a', type: 'detak', bpm: 72, source: 'kamera', time: NOW, label: 'Normal', level: 'normal' })).toBe(true);
    expect(isEntry({ id: 'a', type: 'detak', bpm: 72, source: 'lain', time: NOW, label: 'Normal', level: 'normal' })).toBe(false);
    expect(isEntry(null)).toBe(false);
  });
});
