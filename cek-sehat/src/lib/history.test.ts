import { beforeEach, describe, expect, it } from 'vitest';
import {
  _setStore,
  addEntry,
  clearEntries,
  deleteEntry,
  formatValue,
  loadEntries,
  seriesFor,
  subscribe,
  toCsv,
  type KV,
} from './history';

function memoryKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 7, 9, 30).getTime();

let kv: ReturnType<typeof memoryKV>;
beforeEach(() => {
  kv = memoryKV();
  _setStore(kv);
});

describe('penyimpanan riwayat', () => {
  it('menyimpan, mengurutkan terbaru dulu, dan bertahan setelah dimuat ulang', () => {
    addEntry({ type: 'detak', bpm: 70, source: 'kamera' }, 'Normal', 'normal', NOW - DAY);
    addEntry({ type: 'tekanan', sys: 130, dia: 85 }, 'Tinggi tahap 1', 'perhatian', NOW);
    expect(loadEntries().map((e) => e.type)).toEqual(['tekanan', 'detak']);

    _setStore(kv); // simulate a reload
    expect(loadEntries()).toHaveLength(2);
  });

  it('hapus per entri dan hapus semua', () => {
    const a = addEntry({ type: 'suhu', celsius: 37 }, 'Normal', 'normal', NOW);
    addEntry({ type: 'suhu', celsius: 38.5 }, 'Demam', 'perhatian', NOW + 1);
    deleteEntry(a.id);
    expect(loadEntries().map((e) => e.type === 'suhu' && e.celsius)).toEqual([38.5]);
    clearEntries();
    expect(loadEntries()).toEqual([]);
  });

  it('memberi tahu pendengar saat data berubah', () => {
    let calls = 0;
    const off = subscribe(() => calls++);
    addEntry({ type: 'gula', mgdl: 95, timing: 'puasa' }, 'Normal', 'normal');
    clearEntries();
    off();
    addEntry({ type: 'gula', mgdl: 95, timing: 'puasa' }, 'Normal', 'normal');
    expect(calls).toBe(2);
  });

  it('data rusak di penyimpanan tidak membuat aplikasi error', () => {
    kv.data.set('csm:history:v1', '{bukan json');
    _setStore(kv);
    expect(loadEntries()).toEqual([]);
  });

  it('tetap jalan tanpa localStorage (mode privat)', () => {
    _setStore(null);
    addEntry({ type: 'detak', bpm: 80, source: 'manual' }, 'Normal', 'normal');
    expect(loadEntries()).toHaveLength(1);
  });
});

describe('ekspor CSV', () => {
  it('header, urutan waktu lama → baru, desimal koma, pemisah titik koma', () => {
    addEntry({ type: 'suhu', celsius: 38.2 }, 'Demam', 'perhatian', new Date(2026, 10, 7, 8, 5).getTime());
    addEntry({ type: 'tekanan', sys: 120, dia: 80 }, 'Tinggi tahap 1', 'perhatian', new Date(2026, 10, 6, 20, 0).getTime());
    addEntry({ type: 'gula', mgdl: 110, timing: 'puasa' }, 'Di atas normal (rentang prediabetes)', 'perhatian', new Date(2026, 10, 7, 7, 0).getTime());
    const csv = toCsv(loadEntries());
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('Tanggal;Jam;Jenis;Nilai;Satuan;Keterangan;Kategori;Status');
    expect(lines[1]).toBe('06/11/2026;20:00;Tekanan darah;120/80;mmHg;;Tinggi tahap 1;Perlu perhatian');
    expect(lines[2]).toBe(
      '07/11/2026;07:00;Gula darah;110;mg/dL;Puasa (belum makan 8 jam);Di atas normal (rentang prediabetes);Perlu perhatian',
    );
    expect(lines[3]).toBe('07/11/2026;08:05;Suhu tubuh;38,2;°C;;Demam;Perlu perhatian');
  });

  it('sel yang berisi titik koma atau tanda kutip di-escape', () => {
    addEntry({ type: 'detak', bpm: 70, source: 'kamera' }, 'A; "B"', 'normal', NOW);
    expect(toCsv(loadEntries())).toContain('"A; ""B"""');
  });

  it('riwayat kosong → hanya header', () => {
    expect(toCsv([]).trim().split('\r\n')).toHaveLength(1);
  });
});

describe('data grafik tren', () => {
  it('memfilter jenis dan rentang 7/30 hari, urut waktu', () => {
    addEntry({ type: 'detak', bpm: 60, source: 'kamera' }, 'Normal', 'normal', NOW - 20 * DAY);
    addEntry({ type: 'detak', bpm: 75, source: 'manual' }, 'Normal', 'normal', NOW - 2 * DAY);
    addEntry({ type: 'detak', bpm: 80, source: 'kamera' }, 'Normal', 'normal', NOW - 1 * DAY);
    addEntry({ type: 'berat', weightKg: 60, heightCm: 160, bmi: 23.4 }, 'Normal', 'normal', NOW);
    const all = loadEntries();
    expect(seriesFor(all, 'detak', 7, NOW).map((p) => p.values[0])).toEqual([75, 80]);
    expect(seriesFor(all, 'detak', 30, NOW).map((p) => p.values[0])).toEqual([60, 75, 80]);
    expect(seriesFor(all, 'berat', 7, NOW)[0].values).toEqual([60]);
  });

  it('tekanan darah punya dua garis (sistolik, diastolik)', () => {
    addEntry({ type: 'tekanan', sys: 125, dia: 82 }, 'x', 'perhatian', NOW);
    expect(seriesFor(loadEntries(), 'tekanan', 7, NOW)[0].values).toEqual([125, 82]);
  });

  it('format nilai', () => {
    const e = addEntry({ type: 'berat', weightKg: 62.5, heightCm: 158, bmi: 25 }, 'Normal', 'normal');
    expect(formatValue(e)).toBe('62,5 kg (IMT 25)');
  });
});
