import { describe, expect, it } from 'vitest';
import {
  calcBmi,
  classifyBloodPressure,
  classifyBmi,
  classifyGlucose,
  classifyPulse,
  classifyTemperature,
  parseNumber,
  validateBloodPressure,
  validateBmiInput,
  validateGlucose,
  validatePulse,
  validateTemperature,
  type Assessment,
} from './classify';

const all: Assessment[] = [];
const track = (a: Assessment) => (all.push(a), a);

describe('IMT (Kemenkes RI)', () => {
  it('menghitung IMT dengan pembulatan 1 desimal', () => {
    expect(calcBmi(70, 170)).toBe(24.2);
    expect(calcBmi(50, 160)).toBe(19.5);
  });

  it.each([
    [10, 'Kurus berat'],
    [16.9, 'Kurus berat'],
    [17, 'Kurus'],
    [18.4, 'Kurus'],
    [18.5, 'Normal'],
    [22, 'Normal'],
    [25, 'Normal'],
    [25.1, 'Gemuk'],
    [27, 'Gemuk'],
    [27.1, 'Obesitas'],
    [40, 'Obesitas'],
  ])('IMT %s → %s', (bmi, label) => {
    expect(track(classifyBmi(bmi)).label).toBe(label);
  });

  it('tidak ada celah antar batas (nilai belum dibulatkan)', () => {
    expect(classifyBmi(18.46).label).toBe('Normal'); // dibulatkan 18,5
    expect(classifyBmi(18.44).label).toBe('Kurus');
    expect(classifyBmi(25.04).label).toBe('Normal');
    expect(classifyBmi(25.06).label).toBe('Gemuk');
  });

  it('warna: hanya normal yang hijau', () => {
    expect(classifyBmi(22).level).toBe('normal');
    expect(classifyBmi(16).level).toBe('perhatian');
    expect(classifyBmi(30).level).toBe('perhatian');
  });

  it('validasi input', () => {
    expect(validateBmiInput(60, 165).ok).toBe(true);
    expect(validateBmiInput(0, 165).ok).toBe(false);
    expect(validateBmiInput(60, 20).ok).toBe(false);
    expect(validateBmiInput(NaN, 165).ok).toBe(false);
  });
});

describe('Tekanan darah (AHA)', () => {
  it.each([
    [110, 70, 'Normal', 'normal'],
    [119, 79, 'Normal', 'normal'],
    [120, 79, 'Sedikit tinggi', 'perhatian'],
    [129, 79, 'Sedikit tinggi', 'perhatian'],
    [130, 70, 'Tinggi tahap 1', 'perhatian'],
    [139, 89, 'Tinggi tahap 1', 'perhatian'],
    [118, 80, 'Tinggi tahap 1', 'perhatian'],
    [125, 85, 'Tinggi tahap 1', 'perhatian'],
    [140, 70, 'Tinggi tahap 2', 'bahaya'],
    [120, 90, 'Tinggi tahap 2', 'bahaya'],
    [180, 120, 'Tinggi tahap 2', 'bahaya'],
    [181, 100, 'Sangat tinggi (krisis)', 'bahaya'],
    [160, 121, 'Sangat tinggi (krisis)', 'bahaya'],
    [89, 70, 'Rendah', 'perhatian'],
    [100, 59, 'Rendah', 'perhatian'],
    [90, 60, 'Normal', 'normal'],
  ])('%s/%s → %s', (s, d, label, level) => {
    const r = track(classifyBloodPressure(s, d));
    expect(r.label).toBe(label);
    expect(r.level).toBe(level);
  });

  it('krisis menyarankan ukur ulang lalu ke IGD', () => {
    const r = classifyBloodPressure(190, 110);
    expect(r.emergency).toBe(true);
    expect(r.advice.join(' ')).toMatch(/ukur ulang/i);
    expect(r.advice.join(' ')).toMatch(/IGD/);
  });

  it('kategori yang lebih tinggi menang', () => {
    expect(classifyBloodPressure(135, 55).label).toBe('Tinggi tahap 1');
  });

  it('validasi input', () => {
    expect(validateBloodPressure(120, 80).ok).toBe(true);
    expect(validateBloodPressure(80, 120).ok).toBe(false);
    expect(validateBloodPressure(20, 10).ok).toBe(false);
    expect(validateBloodPressure(120, NaN).ok).toBe(false);
  });
});

describe('Gula darah', () => {
  it.each([
    [69, 'Terlalu rendah'],
    [70, 'Normal'],
    [99, 'Normal'],
    [100, 'Di atas normal (rentang prediabetes)'],
    [125, 'Di atas normal (rentang prediabetes)'],
    [126, 'Tinggi'],
    [299, 'Tinggi'],
    [300, 'Sangat tinggi'],
  ])('puasa %s → %s', (v, label) => {
    expect(track(classifyGlucose(v, 'puasa')).label).toBe(label);
  });

  it.each(['sewaktu', '2jam'] as const)('%s: batas 140 dan 200', (t) => {
    expect(classifyGlucose(69, t).label).toBe('Terlalu rendah');
    expect(classifyGlucose(70, t).label).toBe('Normal');
    expect(classifyGlucose(139, t).label).toBe('Normal');
    expect(classifyGlucose(140, t).label).toBe('Agak tinggi');
    expect(classifyGlucose(199, t).label).toBe('Agak tinggi');
    expect(classifyGlucose(200, t).label).toBe('Tinggi');
    expect(classifyGlucose(299, t).label).toBe('Tinggi');
    expect(classifyGlucose(300, t).label).toBe('Sangat tinggi');
  });

  it('warna', () => {
    expect(classifyGlucose(90, 'puasa').level).toBe('normal');
    expect(classifyGlucose(110, 'puasa').level).toBe('perhatian');
    expect(classifyGlucose(130, 'puasa').level).toBe('bahaya');
    expect(classifyGlucose(60, 'sewaktu').emergency).toBe(true);
    expect(classifyGlucose(320, 'sewaktu').emergency).toBe(true);
  });

  it('validasi input', () => {
    expect(validateGlucose(100).ok).toBe(true);
    expect(validateGlucose(5).ok).toBe(false);
    expect(validateGlucose(900).ok).toBe(false);
  });
});

describe('Suhu tubuh', () => {
  it.each([
    [34.9, 'Terlalu dingin (hipotermia)', 'bahaya'],
    [35, 'Agak rendah', 'perhatian'],
    [35.9, 'Agak rendah', 'perhatian'],
    [36, 'Normal', 'normal'],
    [37.5, 'Normal', 'normal'],
    [37.6, 'Hangat', 'perhatian'],
    [37.9, 'Hangat', 'perhatian'],
    [38, 'Demam', 'perhatian'],
    [39.9, 'Demam', 'perhatian'],
    [40, 'Demam sangat tinggi', 'bahaya'],
    [41.5, 'Demam sangat tinggi', 'bahaya'],
  ])('%s °C → %s', (t, label, level) => {
    const r = track(classifyTemperature(t));
    expect(r.label).toBe(label);
    expect(r.level).toBe(level);
  });

  it('pembulatan 1 desimal menutup celah', () => {
    expect(classifyTemperature(37.54).label).toBe('Normal');
    expect(classifyTemperature(37.56).label).toBe('Hangat');
  });

  it('validasi input', () => {
    expect(validateTemperature(36.8).ok).toBe(true);
    expect(validateTemperature(25).ok).toBe(false);
    expect(validateTemperature(50).ok).toBe(false);
  });
});

describe('Nadi', () => {
  it.each([
    [40, 'Lambat', 'perhatian'],
    [49, 'Lambat', 'perhatian'],
    [50, 'Normal', 'normal'],
    [72, 'Normal', 'normal'],
    [100, 'Normal', 'normal'],
    [101, 'Cepat', 'perhatian'],
    [120, 'Cepat', 'perhatian'],
    [121, 'Sangat cepat', 'bahaya'],
    [150, 'Sangat cepat', 'bahaya'],
  ])('%s bpm → %s', (v, label, level) => {
    const r = track(classifyPulse(v));
    expect(r.label).toBe(label);
    expect(r.level).toBe(level);
  });

  it('>120 saat istirahat → perlu diperiksa hari ini', () => {
    expect(classifyPulse(130).advice.join(' ')).toMatch(/hari ini/);
  });

  it('validasi input', () => {
    expect(validatePulse(72).ok).toBe(true);
    expect(validatePulse(10).ok).toBe(false);
    expect(validatePulse(300).ok).toBe(false);
  });
});

describe('parseNumber', () => {
  it('menerima koma sebagai desimal', () => {
    expect(parseNumber('36,8')).toBe(36.8);
    expect(parseNumber(' 120 ')).toBe(120);
    expect(parseNumber('')).toBeNaN();
    expect(parseNumber('abc')).toBeNaN();
  });
});

describe('Bahasa hasil', () => {
  it('tidak pernah memakai kalimat diagnosis', () => {
    // `all` diisi oleh test di atas yang berjalan lebih dulu
    expect(all.length).toBeGreaterThan(40);
    for (const a of all) {
      const text = [a.label, a.message, ...a.advice].join(' ');
      expect(text).not.toMatch(/anda menderita|didiagnosis|diagnosis/i);
    }
  });
});
