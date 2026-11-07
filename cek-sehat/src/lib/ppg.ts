/**
 * Photoplethysmography (PPG) from a phone camera.
 *
 * The fingertip covers the camera and flash. Each heartbeat pushes a little
 * more blood into the fingertip, which absorbs more light, so the average red
 * value of the frame dips and rises with the pulse. This module turns that
 * series of averages into a heart rate plus a quality score.
 *
 * Pipeline: resample to a uniform rate → detrend → band-pass 0.7–3.5 Hz
 * (42–210 bpm, zero-phase) → FFT for the dominant frequency → peak detection
 * for beat-to-beat intervals → cross-check both → quality score.
 */

export interface Sample {
  /** timestamp in milliseconds */
  t: number;
  /** mean value of the red channel (0–255) */
  r: number;
  /** mean value of the green channel (0–255), fallback when red is saturated */
  g?: number;
}

export const BAND_LOW_HZ = 0.7;
export const BAND_HIGH_HZ = 3.5;
export const TARGET_FS = 30;
/** Minimum quality to show a number at all. */
export const QUALITY_THRESHOLD = 0.6;

/* ------------------------------------------------------------ basics */

export function mean(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  return x.length ? s / x.length : 0;
}

export function std(x: ArrayLike<number>): number {
  const m = mean(x);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i] - m) ** 2;
  return x.length ? Math.sqrt(s / x.length) : 0;
}

function median(x: number[]): number {
  if (!x.length) return NaN;
  const s = [...x].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Linear interpolation onto a uniform grid; camera frames do not arrive at exact intervals. */
export function resample(t: number[], v: number[], fs: number): number[] {
  if (t.length < 2) return [...v];
  const dt = 1000 / fs;
  const out: number[] = [];
  let j = 0;
  for (let ti = t[0]; ti <= t[t.length - 1]; ti += dt) {
    while (j < t.length - 2 && t[j + 1] < ti) j++;
    const span = t[j + 1] - t[j];
    const a = span > 0 ? (ti - t[j]) / span : 0;
    out.push(v[j] + (v[j + 1] - v[j]) * Math.min(1, Math.max(0, a)));
  }
  return out;
}

/** Remove the mean and the best-fit straight line (slow drift from pressure and warming). */
export function detrend(x: number[]): number[] {
  const n = x.length;
  if (n < 2) return x.map(() => 0);
  const xm = (n - 1) / 2;
  const ym = mean(x);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xm) * (x[i] - ym);
    den += (i - xm) ** 2;
  }
  const slope = num / den;
  return x.map((y, i) => y - ym - slope * (i - xm));
}

/* ------------------------------------------------------------ filter */

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** 2nd-order Butterworth section (RBJ cookbook, Q = 1/√2). */
function butter2(kind: 'low' | 'high', f0: number, fs: number): Biquad {
  const w0 = (2 * Math.PI * f0) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b =
    kind === 'low'
      ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2]
      : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  return { b0: b[0] / a0, b1: b[1] / a0, b2: b[2] / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

function runBiquad(x: number[], f: Biquad): number[] {
  const y = new Array<number>(x.length);
  let x1 = x[0] ?? 0,
    x2 = x1,
    y1 = 0,
    y2 = 0;
  // start from steady state for a constant input to soften the edge
  const dcGain = (f.b0 + f.b1 + f.b2) / (1 + f.a1 + f.a2);
  y1 = y2 = Number.isFinite(dcGain) ? dcGain * x1 : 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const yi = f.b0 * xi + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = yi;
    y[i] = yi;
  }
  return y;
}

/**
 * Zero-phase band-pass: a 2nd-order Butterworth high-pass and low-pass, run
 * forward and backward (like `filtfilt`), so 4th order overall with no delay. Edges are padded by
 * odd reflection to reduce start-up transients.
 */
export function bandpass(x: number[], fs: number, low = BAND_LOW_HZ, high = BAND_HIGH_HZ): number[] {
  const n = x.length;
  if (n < 4) return x.map(() => 0);
  const pad = Math.min(n - 1, Math.round(fs * 3));
  const padded: number[] = [];
  for (let i = pad; i > 0; i--) padded.push(2 * x[0] - x[i]);
  padded.push(...x);
  for (let i = n - 2; i >= n - 1 - pad; i--) padded.push(2 * x[n - 1] - x[i]);

  const sections = [butter2('high', low, fs), butter2('low', high, fs)];
  const pass = (s: number[]) => sections.reduce((acc, f) => runBiquad(acc, f), s);
  let y = pass(padded);
  y = pass(y.reverse()).reverse();
  return y.slice(pad, pad + n);
}

/* --------------------------------------------------------------- FFT */

/** In-place iterative radix-2 FFT. Length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1,
        ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

export interface Spectrum {
  freqs: number[];
  power: number[];
}

/** Power spectrum (Hann window, zero-padded to ≥ 8192 points) limited to the heart-rate band. */
export function bandSpectrum(x: number[], fs: number, low = BAND_LOW_HZ, high = BAND_HIGH_HZ): Spectrum {
  let n = 8192;
  while (n < x.length) n <<= 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const N = x.length;
  for (let i = 0; i < N; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  fft(re, im);
  const freqs: number[] = [];
  const power: number[] = [];
  for (let k = 0; k <= n / 2; k++) {
    const f = (k * fs) / n;
    if (f < low || f > high) continue;
    freqs.push(f);
    power.push(re[k] * re[k] + im[k] * im[k]);
  }
  return { freqs, power };
}

/** Dominant frequency in the band; prefers the fundamental over its 2nd harmonic. */
export function dominantFrequency(spec: Spectrum): { freq: number; concentration: number } {
  const { freqs, power } = spec;
  if (!power.length) return { freq: NaN, concentration: 0 };
  let k = 0;
  for (let i = 1; i < power.length; i++) if (power[i] > power[k]) k = i;

  const powerNear = (f: number, halfWidth: number) => {
    let s = 0;
    for (let i = 0; i < freqs.length; i++) if (Math.abs(freqs[i] - f) <= halfWidth) s += power[i];
    return s;
  };
  const maxNear = (f: number, halfWidth: number) => {
    let m = 0;
    for (let i = 0; i < freqs.length; i++) if (Math.abs(freqs[i] - f) <= halfWidth) m = Math.max(m, power[i]);
    return m;
  };

  let freq = freqs[k];
  // A pulse wave with a strong dicrotic notch can make the 2nd harmonic win.
  const half = freq / 2;
  if (half >= BAND_LOW_HZ && maxNear(half, 0.05) > 0.5 * power[k]) freq = half;

  // Parabolic interpolation around the chosen bin for sub-bin precision.
  const idx = freqs.reduce((best, f, i) => (Math.abs(f - freq) < Math.abs(freqs[best] - freq) ? i : best), 0);
  if (idx > 0 && idx < power.length - 1) {
    const [a, b, c] = [power[idx - 1], power[idx], power[idx + 1]];
    const d = a - 2 * b + c;
    if (d < 0) freq = freqs[idx] + (0.5 * (a - c)) / d * (freqs[1] - freqs[0]);
  }

  const total = power.reduce((s, p) => s + p, 0);
  const inPeaks = powerNear(freq, 0.12) + (freq * 2 <= BAND_HIGH_HZ ? powerNear(freq * 2, 0.12) : 0);
  return { freq, concentration: total > 0 ? inPeaks / total : 0 };
}

/* ------------------------------------------------------------- peaks */

/** Local maxima at least `minDist` samples apart and above `minHeight`. */
export function findPeaks(x: number[], minDist: number, minHeight: number): number[] {
  const cand: number[] = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (x[i] > minHeight && x[i] > x[i - 1] && x[i] >= x[i + 1]) cand.push(i);
  }
  // keep the tallest peaks first, drop neighbours that are too close
  const byHeight = [...cand].sort((a, b) => x[b] - x[a]);
  const taken: number[] = [];
  for (const i of byHeight) {
    if (taken.every((j) => Math.abs(i - j) >= minDist)) taken.push(i);
  }
  return taken.sort((a, b) => a - b);
}

/* ---------------------------------------------------------- analysis */

export interface PpgResult {
  /** Final heart rate, or null when the signal is not reliable enough. */
  bpm: number | null;
  bpmPeaks: number;
  bpmFft: number;
  /** 0–1 */
  quality: number;
  ok: boolean;
  /** Why the measurement was rejected (Indonesian, for the user). */
  reason?: string;
  channel: 'r' | 'g';
  fs: number;
  /** Filtered signal, for display. */
  filtered: number[];
}

/**
 * Analyse a series of frame averages.
 * @param skipMs leading time to ignore while the camera's exposure settles.
 */
export function analyzePpg(samples: Sample[], skipMs = 1500): PpgResult {
  const fail = (reason: string, extra: Partial<PpgResult> = {}): PpgResult => ({
    bpm: null,
    bpmPeaks: NaN,
    bpmFft: NaN,
    quality: 0,
    ok: false,
    reason,
    channel: 'r',
    fs: TARGET_FS,
    filtered: [],
    ...extra,
  });

  const s = samples.filter((x) => Number.isFinite(x.t) && Number.isFinite(x.r));
  if (s.length < 2) return fail('Data terlalu sedikit.');
  const start = s[0].t + skipMs;
  const used = s.filter((x) => x.t >= start);
  const durationS = used.length > 1 ? (used[used.length - 1].t - used[0].t) / 1000 : 0;
  if (durationS < 10) return fail('Pengukuran terlalu singkat.');
  const actualFs = (used.length - 1) / durationS;
  if (actualFs < 10) return fail('Kamera terlalu lambat. Tutup aplikasi lain lalu coba lagi.');

  // A strong flash can saturate red at 255; then the pulse lives in green.
  const reds = used.map((x) => x.r);
  const saturated = mean(reds) > 250 && std(reds) < 0.5 && used.every((x) => x.g !== undefined);
  const channel: 'r' | 'g' = saturated ? 'g' : 'r';
  const raw = used.map((x) => (channel === 'r' ? x.r : (x.g as number)));

  const fs = TARGET_FS;
  const uniform = resample(
    used.map((x) => x.t),
    raw,
    fs,
  );
  // Absorption rises with blood volume, so the beat is a dip; invert so beats are peaks.
  const filtered = bandpass(detrend(uniform), fs).map((v) => -v);

  const sd = std(filtered);
  if (!(sd > 1e-6)) return fail('Sinyal denyut tidak terdeteksi.', { channel, filtered });

  // 1) FFT
  const { freq, concentration } = dominantFrequency(bandSpectrum(filtered, fs));
  const bpmFft = freq * 60;

  // 2) peaks; minimum distance guided by the FFT estimate, never faster than 210 bpm
  const minDist = Math.max(Math.floor(fs / BAND_HIGH_HZ), Math.floor((0.55 * fs) / freq));
  const peaks = findPeaks(filtered, minDist, 0.25 * sd);
  const ibis: number[] = [];
  for (let i = 1; i < peaks.length; i++) ibis.push((peaks[i] - peaks[i - 1]) / fs);
  const ibiMed = median(ibis);
  const kept = ibis.filter((v) => Math.abs(v - ibiMed) <= 0.25 * ibiMed);
  const bpmPeaks = kept.length ? 60 / mean(kept) : NaN;

  // 3) quality
  const spectralQ = clamp01((concentration - 0.2) / 0.4);
  const cv = kept.length > 1 ? std(kept) / mean(kept) : 1;
  const keptFrac = ibis.length ? kept.length / ibis.length : 0;
  const rhythmQ = clamp01(1 - (cv - 0.06) / 0.14) * clamp01((keptFrac - 0.5) / 0.4);
  const diff = Math.abs(bpmPeaks - bpmFft) / bpmFft;
  const agreeQ = Number.isFinite(diff) ? clamp01(1 - (diff - 0.04) / 0.08) : 0;

  // motion: the amplitude of a clean pulse is fairly constant over time
  const win = Math.round(fs * 2);
  const winStd: number[] = [];
  for (let i = 0; i + win <= filtered.length; i += win) winStd.push(std(filtered.slice(i, i + win)));
  const ratio = winStd.length ? Math.max(...winStd) / Math.max(1e-9, median(winStd)) : 99;
  const motionQ = clamp01(1 - (ratio - 1.8) / 1.7);

  const quality = 0.3 * spectralQ + 0.25 * rhythmQ + 0.25 * agreeQ + 0.2 * motionQ;
  const base = { bpmPeaks, bpmFft, quality, channel, fs, filtered };

  let reason: string | undefined;
  if (motionQ < 0.3) reason = 'Jari atau HP bergerak, atau tekanan jari berubah-ubah.';
  else if (agreeQ < 0.3 || rhythmQ < 0.2) reason = 'Denyut tidak terbaca dengan teratur.';
  else if (quality < QUALITY_THRESHOLD) reason = 'Sinyal denyut kurang jelas.';

  if (reason) return { ...base, bpm: null, ok: false, reason };

  // Both methods agree; FFT has the finer resolution over a 30 s window.
  const bpm = Math.round((2 * bpmFft + bpmPeaks) / 3);
  if (bpm < 40 || bpm > 210) return { ...base, bpm: null, ok: false, reason: 'Angka di luar rentang yang bisa diukur.' };
  return { ...base, bpm, ok: true };
}

/* ------------------------------------------------------- frame check */

export interface FrameStats {
  r: number;
  g: number;
  b: number;
  /** standard deviation of red across the sampled area */
  rStd: number;
}

/**
 * Is a fingertip covering the lens? A lit fingertip makes the frame
 * strongly red and evenly coloured; open space is neither.
 */
export function isFingerCovering(f: FrameStats): boolean {
  return f.r > 60 && f.r > 1.6 * f.g && f.r > 1.6 * f.b && f.rStd < 35;
}

/** Mean RGB and red spread from RGBA pixel data. */
export function frameStats(data: Uint8ClampedArray | number[]): FrameStats {
  const n = data.length / 4;
  let r = 0,
    g = 0,
    b = 0,
    r2 = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    r2 += data[i] * data[i];
  }
  r /= n;
  g /= n;
  b /= n;
  return { r, g, b, rStd: Math.sqrt(Math.max(0, r2 / n - r * r)) };
}
