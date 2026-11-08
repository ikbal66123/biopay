import { describe, expect, it } from 'vitest';
import { limitUse, scale, shareWords } from './nutrition';

const n = { kalori: 650, karbohidrat_g: 80, gula_g: 12, serat_g: 2, protein_g: 30, lemak_g: 24, lemak_jenuh_g: 7, natrium_mg: 1100, kolesterol_mg: 95 };

describe('gizi foto makanan', () => {
  it('porsi ½ dan 2 piring', () => {
    expect(scale(n, 0.5).kalori).toBe(325);
    expect(scale(n, 0.5).natrium_mg).toBe(550);
    expect(scale(n, 2).gula_g).toBe(24);
  });

  it('batas harian Kemenkes: gula 50 g, natrium 2000 mg, lemak 67 g', () => {
    const u = Object.fromEntries(limitUse(n).map((x) => [x.key, x]));
    expect(u.natrium_mg.share).toBeCloseTo(0.55);
    expect(u.natrium_mg.level).toBe('bahaya'); // > separuh
    expect(u.lemak_g.level).toBe('perhatian'); // 24/67 ≈ 0,36
    expect(u.gula_g.level).toBe('normal'); // 12/50 = 0,24
  });

  it('kata-kata, bukan persen', () => {
    expect(shareWords(1.2)).toBe('melebihi batas sehari');
    expect(shareWords(0.55)).toBe('lebih dari separuh batas sehari');
    expect(shareWords(0.4)).toMatch(/sepertiga/);
    expect(shareWords(0.05)).toBe('sedikit');
  });
});
