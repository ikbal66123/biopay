import { describe, expect, it } from 'vitest';
import { haversineKm, quoteVisit, rupiah, TARIFF } from './tariff';

describe('tarif kunjungan dokter', () => {
  it('dalam radius dasar → tarif dasar saja', () => {
    const q = quoteVisit({ distanceKm: 5, hour: 10 });
    expect(q.kind === 'tarif' && q.total).toBe(TARIFF.base);
  });

  it('per km tambahan dibulatkan ke atas', () => {
    const q = quoteVisit({ distanceKm: 7.2, hour: 10 });
    expect(q.kind === 'tarif' && q.total).toBe(TARIFF.base + 3 * TARIFF.perKm);
  });

  it('malam, hari libur, lokasi sulit', () => {
    const q = quoteVisit({ distanceKm: 3, hour: 23, holiday: true, difficult: true });
    if (q.kind !== 'tarif') throw new Error();
    expect(q.total).toBe(150_000 + 37_500 + 30_000 + 50_000);
    expect(quoteVisit({ distanceKm: 3, hour: 6 }).kind === 'tarif' && (quoteVisit({ distanceKm: 3, hour: 6 }) as { total: number }).total).toBe(150_000);
    expect((quoteVisit({ distanceKm: 3, hour: 5 }) as { total: number }).total).toBe(187_500);
  });

  it('pelanggan: kunjungan gratis, lalu diskon', () => {
    expect((quoteVisit({ distanceKm: 10, hour: 10, subscriber: true, freeVisitsLeft: 1 }) as { total: number }).total).toBe(0);
    const q = quoteVisit({ distanceKm: 5, hour: 10, subscriber: true, freeVisitsLeft: 0 }) as { total: number };
    expect(q.total).toBe(105_000);
  });

  it('darurat TIDAK pernah diberi harga', () => {
    expect(quoteVisit({ distanceKm: 3, hour: 23, holiday: true, emergency: true })).toEqual({ kind: 'darurat' });
  });

  it('terlalu jauh → di luar jangkauan', () => {
    expect(quoteVisit({ distanceKm: 40, hour: 10 }).kind).toBe('luar-jangkauan');
    expect(quoteVisit({ distanceKm: NaN, hour: 10 }).kind).toBe('luar-jangkauan');
  });

  it('perkiraan waktu tiba', () => {
    const q = quoteVisit({ distanceKm: 10, hour: 10 });
    expect(q.kind === 'tarif' && q.etaMinutes).toBe(15 + 24);
  });

  it('format rupiah dan jarak', () => {
    expect(rupiah(150000)).toBe('Rp150.000');
    expect(rupiah(-45000)).toBe('−Rp45.000');
    // Monas → Bundaran HI ≈ 2,3 km
    expect(haversineKm({ lat: -6.1754, lon: 106.8272 }, { lat: -6.1949, lon: 106.8231 })).toBeCloseTo(2.2, 0);
  });
});
