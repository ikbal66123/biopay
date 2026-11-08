/**
 * Portion scaling and daily limits for the food-photo result.
 * Limits: Kemenkes "GGL" guidance (gula 50 g, natrium 2000 mg ≈ 1 sdt garam, lemak 67 g per hari).
 */
import type { MakananResult } from './ai/schemas';

export type PerPorsi = MakananResult['per_porsi'];

export const DAILY_LIMIT = { gula_g: 50, natrium_mg: 2000, lemak_g: 67 } as const;

export function scale(n: PerPorsi, portion: number): PerPorsi {
  const out = {} as PerPorsi;
  for (const k of Object.keys(n) as (keyof PerPorsi)[]) out[k] = Math.round(n[k] * portion * 10) / 10;
  return out;
}

export interface LimitUse {
  key: keyof typeof DAILY_LIMIT;
  label: string;
  amount: number;
  unit: string;
  limit: number;
  /** share of the daily limit used by this meal (0..∞) */
  share: number;
  level: 'normal' | 'perhatian' | 'bahaya';
}

/** How much of the daily sugar/salt/fat limit one meal uses. More than a third = attention, more than half = high. */
export function limitUse(n: PerPorsi): LimitUse[] {
  const rows: [keyof typeof DAILY_LIMIT, string, string][] = [
    ['gula_g', 'Gula', 'g'],
    ['natrium_mg', 'Garam (natrium)', 'mg'],
    ['lemak_g', 'Lemak', 'g'],
  ];
  return rows.map(([key, label, unit]) => {
    const amount = n[key];
    const share = amount / DAILY_LIMIT[key];
    return { key, label, amount, unit, limit: DAILY_LIMIT[key], share, level: share > 0.5 ? 'bahaya' : share > 1 / 3 ? 'perhatian' : 'normal' };
  });
}

/** Plain words instead of a percentage. */
export function shareWords(share: number): string {
  if (share >= 1) return 'melebihi batas sehari';
  if (share > 0.5) return 'lebih dari separuh batas sehari';
  if (share > 1 / 3) return 'sekitar sepertiga sampai separuh batas sehari';
  if (share > 0.15) return 'sebagian kecil batas sehari';
  return 'sedikit';
}
