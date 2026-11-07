import { describe, expect, it } from 'vitest';
import { agreement, verdict } from './agreement';

describe('analisis Bland-Altman', () => {
  it('menghitung bias, SD, batas kesepakatan, MAE', () => {
    // differences: +2, -2, +4, 0
    const a = agreement([
      { app: 72, ref: 70 },
      { app: 78, ref: 80 },
      { app: 94, ref: 90 },
      { app: 60, ref: 60 },
    ]);
    expect(a.n).toBe(4);
    expect(a.bias).toBeCloseTo(1);
    expect(a.sd).toBeCloseTo(Math.sqrt((1 + 9 + 9 + 1) / 3));
    expect(a.loaLow).toBeCloseTo(1 - 1.96 * a.sd);
    expect(a.loaHigh).toBeCloseTo(1 + 1.96 * a.sd);
    expect(a.mae).toBeCloseTo(2);
    expect(a.rmse).toBeCloseTo(Math.sqrt((4 + 4 + 16 + 0) / 4));
    expect(a.within5).toBe(1);
  });

  it('pengukuran yang ditolak aplikasi dihitung terpisah', () => {
    const a = agreement([
      { app: null, ref: 70 },
      { app: 70, ref: 70 },
    ]);
    expect(a.total).toBe(2);
    expect(a.rejected).toBe(1);
    expect(a.n).toBe(1);
  });

  it('aturan AAMI: ±5 bpm atau ±10%, mana yang lebih besar', () => {
    const a = agreement([
      { app: 132, ref: 120 }, // 12 ≤ 12 → lolos
      { app: 133, ref: 120 }, // 13 > 12 → gagal
      { app: 45, ref: 40 }, // 10% = 4, so the 5 bpm floor applies: 5 ≤ 5 → lolos
      { app: 46, ref: 40 }, // 6 > 5 → gagal
    ]);
    expect(a.withinAami).toBe(0.5);
    expect(a.within5).toBe(0.25);
  });

  it('data kosong tidak error', () => {
    const a = agreement([]);
    expect(a.n).toBe(0);
    expect(Number.isNaN(a.bias)).toBe(true);
    expect(verdict(a).level).toBe('kurang-data');
  });

  it('kesimpulan', () => {
    const good = Array.from({ length: 30 }, (_, i) => ({ app: 70 + (i % 3) - 1, ref: 70 }));
    expect(verdict(agreement(good)).level).toBe('baik');
    const bad = Array.from({ length: 30 }, (_, i) => ({ app: 70 + (i % 2 ? 15 : -15), ref: 70 }));
    expect(verdict(agreement(bad)).level).toBe('kurang');
  });
});
