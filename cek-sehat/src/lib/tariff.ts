/**
 * Home-visit fee by distance. EXAMPLE tariff for the demo; real prices are set
 * with partner clinics. Emergencies are never priced: they go to 112/119/115.
 */

export const TARIFF = {
  base: 150_000, // within the base radius
  baseRadiusKm: 5,
  perKm: 8_000,
  maxKm: 25,
  nightPct: 0.25, // 22:00–05:59
  holidayPct: 0.2,
  difficult: 50_000, // hard-to-reach location (stairs, no road access, island)
  subscriberDiscountPct: 0.3,
  speedKmh: 25, // city traffic
  prepMinutes: 15,
};

export interface VisitInput {
  distanceKm: number;
  /** local hour 0–23 */
  hour: number;
  holiday?: boolean;
  difficult?: boolean;
  subscriber?: boolean;
  /** free visits left in the subscription this month */
  freeVisitsLeft?: number;
  emergency?: boolean;
}

export type VisitQuote =
  | { kind: 'darurat' }
  | { kind: 'luar-jangkauan'; maxKm: number }
  | {
      kind: 'tarif';
      lines: { label: string; amount: number }[];
      total: number;
      etaMinutes: number;
    };

const round500 = (n: number) => Math.round(n / 500) * 500;

export function quoteVisit(v: VisitInput): VisitQuote {
  if (v.emergency) return { kind: 'darurat' };
  if (!(v.distanceKm >= 0) || v.distanceKm > TARIFF.maxKm) return { kind: 'luar-jangkauan', maxKm: TARIFF.maxKm };

  const lines: { label: string; amount: number }[] = [{ label: `Tarif dasar (sampai ${TARIFF.baseRadiusKm} km)`, amount: TARIFF.base }];
  const extraKm = Math.max(0, Math.ceil(v.distanceKm - TARIFF.baseRadiusKm));
  if (extraKm) lines.push({ label: `Jarak tambahan ${extraKm} km`, amount: extraKm * TARIFF.perKm });

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const night = v.hour >= 22 || v.hour < 6;
  if (night) lines.push({ label: 'Malam hari (22.00–06.00)', amount: round500(subtotal * TARIFF.nightPct) });
  if (v.holiday) lines.push({ label: 'Hari libur', amount: round500(subtotal * TARIFF.holidayPct) });
  if (v.difficult) lines.push({ label: 'Lokasi sulit dijangkau', amount: TARIFF.difficult });

  let total = lines.reduce((s, l) => s + l.amount, 0);
  if (v.subscriber) {
    if ((v.freeVisitsLeft ?? 0) > 0) {
      lines.push({ label: 'Kunjungan gratis paket langganan', amount: -total });
      total = 0;
    } else {
      const disc = round500(total * TARIFF.subscriberDiscountPct);
      lines.push({ label: 'Diskon pelanggan dokter langganan', amount: -disc });
      total -= disc;
    }
  }
  const etaMinutes = Math.round(TARIFF.prepMinutes + (v.distanceKm / TARIFF.speedKmh) * 60);
  return { kind: 'tarif', lines, total, etaMinutes };
}

export const rupiah = (n: number) => `${n < 0 ? '−' : ''}Rp${Math.abs(n).toLocaleString('id-ID')}`;

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
