import { describe, expect, it } from 'vitest';
import { suggestMenus } from './menu';

describe('menu sehat sesuai kantong', () => {
  it('diabetes, Rp20 ribu: semua menu di bawah anggaran, tanpa nasi penuh & minuman manis', () => {
    const m = suggestMenus(['diabetes'], 20000);
    expect(m.length).toBe(3);
    for (const combo of m) {
      expect(combo.total).toBeLessThanOrEqual(20000);
      const ids = combo.dishes.map((d) => d.id);
      expect(ids).not.toContain('nasi-putih');
      expect(ids).not.toContain('teh-manis');
      expect(ids).not.toContain('tempe-bacem');
      expect(combo.dishes.map((d) => d.role)).toEqual(expect.arrayContaining(['pokok', 'lauk', 'sayur']));
    }
  });

  it('hipertensi: tanpa ikan asin, rendang, santan', () => {
    for (const combo of suggestMenus(['hipertensi'], 50000)) {
      for (const d of combo.dishes) {
        expect(d.salt).not.toBe('tinggi');
        expect(d.coconut).toBeFalsy();
      }
    }
  });

  it('demam: mendahulukan makanan lunak dan tanpa gorengan', () => {
    const m = suggestMenus(['demam'], 25000);
    expect(m[0].dishes.some((d) => d.soft)).toBe(true);
    for (const combo of m) for (const d of combo.dishes) expect(d.fried).toBeFalsy();
  });

  it('anggaran terlalu kecil → tidak ada menu', () => {
    expect(suggestMenus([], 5000)).toEqual([]);
  });

  it('menu bervariasi (lauk berbeda)', () => {
    const lauk = suggestMenus([], 30000).map((c) => c.dishes.find((d) => d.role === 'lauk')!.id);
    expect(new Set(lauk).size).toBe(lauk.length);
  });
});
