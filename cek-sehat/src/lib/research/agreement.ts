/**
 * Agreement between the camera estimate and a reference device
 * (Bland–Altman analysis, the standard method for comparing two
 * measurement methods).
 */

export interface Pair {
  /** camera estimate, or null when the app refused to show a number */
  app: number | null;
  /** reference device (pulse oximeter, ECG, manual count) */
  ref: number;
}

export interface Agreement {
  total: number;
  /** measurements the app refused because the signal was poor */
  rejected: number;
  /** pairs with a number from both methods */
  n: number;
  /** mean of (app − ref); positive = app reads high */
  bias: number;
  /** sample standard deviation of the differences */
  sd: number;
  /** 95% limits of agreement: bias ± 1.96·sd */
  loaLow: number;
  loaHigh: number;
  /** mean absolute error */
  mae: number;
  rmse: number;
  /** share of pairs within ±5 bpm */
  within5: number;
  /**
   * Share within ±10% or ±5 bpm, whichever is larger: the accuracy rule for
   * heart-rate meters in ANSI/AAMI EC13.
   */
  withinAami: number;
}

export function agreement(pairs: Pair[]): Agreement {
  const valid = pairs.filter((p) => p.app !== null && Number.isFinite(p.app) && Number.isFinite(p.ref)) as {
    app: number;
    ref: number;
  }[];
  const d = valid.map((p) => p.app - p.ref);
  const n = d.length;
  const bias = n ? d.reduce((s, x) => s + x, 0) / n : NaN;
  const sd = n > 1 ? Math.sqrt(d.reduce((s, x) => s + (x - bias) ** 2, 0) / (n - 1)) : NaN;
  return {
    total: pairs.length,
    rejected: pairs.length - n,
    n,
    bias,
    sd,
    loaLow: bias - 1.96 * sd,
    loaHigh: bias + 1.96 * sd,
    mae: n ? d.reduce((s, x) => s + Math.abs(x), 0) / n : NaN,
    rmse: n ? Math.sqrt(d.reduce((s, x) => s + x * x, 0) / n) : NaN,
    within5: n ? d.filter((x) => Math.abs(x) <= 5).length / n : NaN,
    withinAami: n ? valid.filter((p) => Math.abs(p.app - p.ref) <= Math.max(5, 0.1 * p.ref)).length / n : NaN,
  };
}

/** Plain-language verdict for the summary screen. */
export function verdict(a: Agreement): { level: 'kurang-data' | 'baik' | 'cukup' | 'kurang'; text: string } {
  if (a.n < 10)
    return {
      level: 'kurang-data',
      text: `Baru ${a.n} pasangan data. Kumpulkan minimal 30 (idealnya 100 dari banyak orang) sebelum menarik kesimpulan.`,
    };
  if (a.withinAami >= 0.9 && Math.abs(a.bias) <= 3)
    return { level: 'baik', text: 'Akurasi baik: sebagian besar hasil kamera dekat dengan alat pembanding.' };
  if (a.withinAami >= 0.75)
    return { level: 'cukup', text: 'Akurasi cukup, tetapi masih ada hasil yang meleset. Perlu perbaikan atau data lebih banyak.' };
  return { level: 'kurang', text: 'Akurasi belum memadai. Lihat pada kondisi apa hasilnya meleset (HP, warna kulit, detak tinggi).' };
}
