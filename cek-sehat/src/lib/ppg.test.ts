import { describe, expect, it } from 'vitest';
import {
  analyzePpg,
  bandpass,
  bandSpectrum,
  detrend,
  dominantFrequency,
  fft,
  findPeaks,
  frameStats,
  isFingerCovering,
  resample,
  std,
  type Sample,
} from './ppg';

/** Deterministic PRNG (mulberry32) so the tests never flake. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

interface SynthOpts {
  bpm: number;
  seconds?: number;
  fps?: number;
  noise?: number; // std, relative to pulse amplitude 1
  jitterMs?: number;
  harmonic?: number;
  seed?: number;
  drift?: boolean;
}

/**
 * Synthetic camera signal: DC level ~180, pulse amplitude 1 (a real finger
 * gives roughly 0.5–3 levels), slow drift, Gaussian noise and uneven frame times.
 */
function synth(o: SynthOpts): Sample[] {
  const { bpm, seconds = 30, fps = 30, noise = 0.5, jitterMs = 4, harmonic = 0, seed = 1, drift = true } = o;
  const r = rng(seed);
  const f = bpm / 60;
  const out: Sample[] = [];
  for (let i = 0; i < seconds * fps; i++) {
    const t = (i * 1000) / fps + (r() - 0.5) * 2 * jitterMs;
    const s = t / 1000;
    const pulse = Math.sin(2 * Math.PI * f * s) + harmonic * Math.sin(4 * Math.PI * f * s + 0.8);
    const base = 180 + (drift ? 6 * Math.sin(2 * Math.PI * 0.05 * s) + 0.1 * s : 0);
    const v = base + pulse + noise * gauss(r);
    out.push({ t: 1_000_000 + t, r: v, g: 40 + 0.3 * pulse });
  }
  return out;
}

describe('analyzePpg dengan sinyal sintetis', () => {
  it('72 bpm + noise terbaca 70–74', () => {
    const res = analyzePpg(synth({ bpm: 72 }));
    expect(res.ok).toBe(true);
    expect(res.bpm).toBeGreaterThanOrEqual(70);
    expect(res.bpm).toBeLessThanOrEqual(74);
    expect(res.quality).toBeGreaterThan(0.6);
  });

  it.each([48, 60, 72, 90, 110, 130, 160])('%s bpm terbaca dalam ±2', (bpm) => {
    for (const seed of [1, 2, 3]) {
      const res = analyzePpg(synth({ bpm, seed }));
      expect(res.ok, `seed ${seed}: ${res.reason}`).toBe(true);
      expect(Math.abs((res.bpm as number) - bpm)).toBeLessThanOrEqual(2);
    }
  });

  it('bentuk gelombang dengan harmonik kuat tetap membaca frekuensi dasar', () => {
    const res = analyzePpg(synth({ bpm: 66, harmonic: 0.7 }));
    expect(res.ok).toBe(true);
    expect(Math.abs((res.bpm as number) - 66)).toBeLessThanOrEqual(2);
  });

  it('frame rate lebih rendah (15 fps) masih bisa', () => {
    const res = analyzePpg(synth({ bpm: 80, fps: 15, jitterMs: 8 }));
    expect(res.ok).toBe(true);
    expect(Math.abs((res.bpm as number) - 80)).toBeLessThanOrEqual(2);
  });

  it('hanya noise → ditolak, tidak ada angka', () => {
    const r = rng(9);
    const samples: Sample[] = Array.from({ length: 900 }, (_, i) => ({ t: (i * 1000) / 30, r: 180 + 2 * gauss(r) }));
    const res = analyzePpg(samples);
    expect(res.ok).toBe(false);
    expect(res.bpm).toBeNull();
    expect(res.reason).toBeTruthy();
  });

  it('gerakan jari (lonjakan besar) → ditolak', () => {
    const samples = synth({ bpm: 75 });
    for (let i = 400; i < 470; i++) samples[i].r += 25 * Math.sin(i / 3);
    const res = analyzePpg(samples);
    expect(res.ok).toBe(false);
    expect(res.bpm).toBeNull();
  });

  it('noise terlalu besar → ditolak', () => {
    const res = analyzePpg(synth({ bpm: 72, noise: 6 }));
    expect(res.ok).toBe(false);
  });

  it('pengukuran terlalu singkat → ditolak', () => {
    const res = analyzePpg(synth({ bpm: 72, seconds: 8 }));
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/singkat/);
  });

  it('kanal merah jenuh (255) → memakai kanal hijau', () => {
    const samples = synth({ bpm: 84, noise: 0 }).map((s) => ({ ...s, r: 255 }));
    const res = analyzePpg(samples);
    expect(res.channel).toBe('g');
    expect(res.ok).toBe(true);
    expect(Math.abs((res.bpm as number) - 84)).toBeLessThanOrEqual(2);
  });
});

describe('blok pengolahan sinyal', () => {
  it('detrend menghapus garis lurus', () => {
    const x = Array.from({ length: 100 }, (_, i) => 5 + 0.3 * i);
    expect(Math.max(...detrend(x).map(Math.abs))).toBeLessThan(1e-9);
  });

  it('resample ke grid seragam', () => {
    const y = resample([0, 100, 250], [0, 10, 25], 20); // dt = 50 ms
    expect(y).toHaveLength(6);
    expect(y[3]).toBeCloseTo(15);
  });

  it('band-pass meloloskan 1,2 Hz dan meredam 0,1 Hz serta 8 Hz', () => {
    const fs = 30;
    const tone = (f: number) => Array.from({ length: 900 }, (_, i) => Math.sin((2 * Math.PI * f * i) / fs));
    const gain = (f: number) => std(bandpass(tone(f), fs).slice(90, -90)) / std(tone(f));
    expect(gain(1.2)).toBeGreaterThan(0.85);
    expect(gain(2)).toBeGreaterThan(0.9);
    expect(gain(0.7)).toBeGreaterThan(0.45); // -6 dB at the band edge
    expect(gain(0.1)).toBeLessThan(0.05);
    expect(gain(8)).toBeLessThan(0.1);
  });

  it('FFT dari sinus murni memuncak di frekuensi yang benar', () => {
    const n = 64;
    const re = new Float64Array(n).map((_, i) => Math.cos((2 * Math.PI * 5 * i) / n));
    const im = new Float64Array(n);
    fft(re, im);
    const mag = Array.from(re, (r, i) => Math.hypot(r, im[i]));
    expect(mag[5]).toBeCloseTo(32);
    expect(mag[3]).toBeCloseTo(0);
  });

  it('frekuensi dominan dari spektrum', () => {
    const fs = 30;
    const x = Array.from({ length: 900 }, (_, i) => Math.sin((2 * Math.PI * 1.5 * i) / fs));
    const { freq, concentration } = dominantFrequency(bandSpectrum(x, fs));
    expect(freq * 60).toBeCloseTo(90, 0);
    expect(concentration).toBeGreaterThan(0.8);
  });

  it('findPeaks menghormati jarak minimum', () => {
    const x = [0, 1, 0, 0.9, 0, 0, 0, 0, 2, 0];
    expect(findPeaks(x, 3, 0.5)).toEqual([1, 8]);
  });
});

describe('deteksi jari', () => {
  const px = (r: number, g: number, b: number, n = 100, spread = 0) =>
    Array.from({ length: n }, (_, i) => [r + (i % 2 ? spread : -spread), g, b, 255]).flat();

  it('jari menutupi kamera dengan flash → terdeteksi', () => {
    expect(isFingerCovering(frameStats(px(200, 40, 30)))).toBe(true);
  });
  it('ruangan biasa → tidak', () => {
    expect(isFingerCovering(frameStats(px(120, 110, 100)))).toBe(false);
  });
  it('gelap → tidak', () => {
    expect(isFingerCovering(frameStats(px(20, 5, 5)))).toBe(false);
  });
  it('merah tetapi tidak merata (benda merah, bukan jari) → tidak', () => {
    expect(isFingerCovering(frameStats(px(150, 30, 30, 100, 60)))).toBe(false);
  });
});
