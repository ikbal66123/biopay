/**
 * Classification of home health numbers.
 *
 * Wording rule: describe the NUMBER ("angka ini termasuk tinggi"), never the
 * person ("Anda menderita ..."). No function here gives a diagnosis.
 */

export type Level = 'normal' | 'perhatian' | 'bahaya';

export interface Assessment {
  /** hijau = normal, kuning = perlu perhatian, merah = segera periksa */
  level: Level;
  /** Short category name, e.g. "Normal", "Tinggi tahap 1". */
  label: string;
  /** One-sentence explanation in plain Indonesian. */
  message: string;
  /** Short practical tips. */
  advice: string[];
  /** True when the user should consider going to the IGD now. */
  emergency?: boolean;
}

export type Validation = { ok: true } | { ok: false; error: string };

const isNum = (n: number) => typeof n === 'number' && Number.isFinite(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ IMT */

export function calcBmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return round1(weightKg / (m * m));
}

export function validateBmiInput(weightKg: number, heightCm: number): Validation {
  if (!isNum(weightKg) || weightKg < 2 || weightKg > 300)
    return { ok: false, error: 'Berat badan harus antara 2 dan 300 kg.' };
  if (!isNum(heightCm) || heightCm < 50 || heightCm > 250)
    return { ok: false, error: 'Tinggi badan harus antara 50 dan 250 cm.' };
  return { ok: true };
}

/**
 * Kemenkes RI categories for adults. The value is rounded to one decimal
 * first so the published bands (…18,4 | 18,5…25,0 | 25,1…) have no gaps.
 */
export function classifyBmi(bmi: number): Assessment {
  const v = round1(bmi);
  if (v < 17)
    return {
      level: 'perhatian',
      label: 'Kurus berat',
      message: 'Angka IMT ini termasuk sangat kurang dari berat badan ideal.',
      advice: [
        'Sebaiknya konsultasi ke dokter atau ahli gizi untuk mencari penyebabnya.',
        'Makan teratur dengan porsi cukup dan bergizi seimbang.',
      ],
    };
  if (v < 18.5)
    return {
      level: 'perhatian',
      label: 'Kurus',
      message: 'Angka IMT ini sedikit di bawah berat badan ideal.',
      advice: ['Tambah porsi makan bergizi secara bertahap.', 'Pantau berat badan setiap minggu.'],
    };
  if (v <= 25)
    return {
      level: 'normal',
      label: 'Normal',
      message: 'Angka IMT ini termasuk berat badan normal.',
      advice: ['Pertahankan pola makan seimbang dan aktif bergerak minimal 30 menit sehari.'],
    };
  if (v <= 27)
    return {
      level: 'perhatian',
      label: 'Gemuk',
      message: 'Angka IMT ini sedikit di atas berat badan ideal.',
      advice: [
        'Kurangi gula, gorengan, dan minuman manis.',
        'Aktif bergerak minimal 150 menit per minggu, misalnya jalan cepat.',
      ],
    };
  return {
    level: 'perhatian',
    label: 'Obesitas',
    message: 'Angka IMT ini termasuk jauh di atas berat badan ideal.',
    advice: [
      'Sebaiknya konsultasi ke dokter atau Puskesmas untuk cek tekanan darah, gula darah, dan kolesterol.',
      'Turunkan berat badan perlahan dengan pola makan sehat dan olahraga teratur.',
    ],
  };
}

/* ------------------------------------------------------- Tekanan darah */

export function validateBloodPressure(sys: number, dia: number): Validation {
  if (!isNum(sys) || sys < 50 || sys > 300)
    return { ok: false, error: 'Angka atas (sistolik) harus antara 50 dan 300.' };
  if (!isNum(dia) || dia < 30 || dia > 200)
    return { ok: false, error: 'Angka bawah (diastolik) harus antara 30 dan 200.' };
  if (dia >= sys) return { ok: false, error: 'Angka atas harus lebih besar dari angka bawah. Periksa lagi urutannya.' };
  return { ok: true };
}

/** AHA 2017 categories. The higher category wins when the two numbers disagree. */
export function classifyBloodPressure(sys: number, dia: number): Assessment {
  if (sys > 180 || dia > 120)
    return {
      level: 'bahaya',
      label: 'Sangat tinggi (krisis)',
      message: 'Angka ini sangat tinggi dan bisa berbahaya.',
      advice: [
        'Duduk tenang 5 menit, lalu ukur ulang.',
        'Jika tetap setinggi ini, segera ke IGD.',
        'Langsung ke IGD jika ada nyeri dada, sesak, sakit kepala hebat, penglihatan kabur, atau lemas sebelah badan.',
      ],
      emergency: true,
    };
  if (sys >= 140 || dia >= 90)
    return {
      level: 'bahaya',
      label: 'Tinggi tahap 2',
      message: 'Angka ini termasuk tinggi.',
      advice: [
        'Sebaiknya periksa ke dokter atau Puskesmas dalam beberapa hari ini.',
        'Kurangi garam, jangan merokok, dan ukur ulang di waktu yang sama setiap hari.',
      ],
    };
  if (sys >= 130 || dia >= 80)
    return {
      level: 'perhatian',
      label: 'Tinggi tahap 1',
      message: 'Angka ini sedikit di atas normal.',
      advice: [
        'Ukur ulang beberapa hari. Jika tetap di angka ini, konsultasikan ke dokter.',
        'Kurangi garam dan makanan asin, aktif bergerak, dan tidur cukup.',
      ],
    };
  if (sys < 90 || dia < 60)
    return {
      level: 'perhatian',
      label: 'Rendah',
      message: 'Angka ini termasuk rendah.',
      advice: [
        'Jika tidak ada keluhan, biasanya tidak berbahaya.',
        'Minum air cukup dan bangun dari duduk atau tidur secara perlahan.',
        'Periksa ke dokter jika disertai pusing berat, lemas, atau hampir pingsan.',
      ],
    };
  if (sys >= 120)
    return {
      level: 'perhatian',
      label: 'Sedikit tinggi',
      message: 'Angka atas sedikit di atas normal.',
      advice: ['Kurangi garam, aktif bergerak, dan ukur ulang secara rutin.'],
    };
  return {
    level: 'normal',
    label: 'Normal',
    message: 'Angka tekanan darah ini termasuk normal.',
    advice: ['Pertahankan gaya hidup sehat. Ukur ulang secara berkala.'],
  };
}

/* ---------------------------------------------------------- Gula darah */

export type GlucoseTiming = 'puasa' | 'sewaktu' | '2jam';

export const GLUCOSE_TIMING_LABEL: Record<GlucoseTiming, string> = {
  puasa: 'Puasa (belum makan 8 jam)',
  sewaktu: 'Sewaktu (kapan saja)',
  '2jam': '2 jam setelah makan',
};

export function validateGlucose(mgdl: number): Validation {
  if (!isNum(mgdl) || mgdl < 20 || mgdl > 600)
    return { ok: false, error: 'Angka gula darah harus antara 20 dan 600 mg/dL.' };
  return { ok: true };
}

export function classifyGlucose(mgdl: number, timing: GlucoseTiming): Assessment {
  if (mgdl < 70)
    return {
      level: 'bahaya',
      label: 'Terlalu rendah',
      message: 'Angka gula darah ini terlalu rendah.',
      advice: [
        'Segera makan atau minum yang manis, misalnya 1 gelas teh manis atau jus buah.',
        'Ukur lagi 15 menit kemudian.',
        'Jika tidak membaik, sangat lemas, bingung, atau tidak sadar → segera ke IGD.',
      ],
      emergency: true,
    };
  if (mgdl >= 300)
    return {
      level: 'bahaya',
      label: 'Sangat tinggi',
      message: 'Angka gula darah ini sangat tinggi.',
      advice: [
        'Minum air putih dan ukur ulang.',
        'Segera periksa ke dokter hari ini.',
        'Segera ke IGD jika disertai muntah, sesak, sangat lemas, atau mengantuk berat.',
      ],
      emergency: true,
    };

  const [limitNormal, limitHigh] = timing === 'puasa' ? [100, 126] : [140, 200];
  if (mgdl < limitNormal)
    return {
      level: 'normal',
      label: 'Normal',
      message: 'Angka gula darah ini termasuk normal.',
      advice: ['Pertahankan pola makan seimbang dan kurangi minuman manis.'],
    };
  if (mgdl < limitHigh)
    return {
      level: 'perhatian',
      label: timing === 'puasa' ? 'Di atas normal (rentang prediabetes)' : 'Agak tinggi',
      message: 'Angka gula darah ini di atas normal.',
      advice: [
        'Sebaiknya cek ulang di Puskesmas atau laboratorium.',
        'Kurangi nasi putih berlebihan, gula, dan minuman manis. Aktif bergerak setiap hari.',
      ],
    };
  return {
    level: 'bahaya',
    label: 'Tinggi',
    message: 'Angka gula darah ini termasuk tinggi.',
    advice: [
      'Sebaiknya periksa ke dokter untuk pemeriksaan lanjutan.',
      'Jika sudah punya obat dari dokter, minum sesuai anjuran.',
    ],
  };
}

/* ---------------------------------------------------------- Suhu tubuh */

export function validateTemperature(c: number): Validation {
  if (!isNum(c) || c < 30 || c > 45) return { ok: false, error: 'Suhu harus antara 30 dan 45 °C.' };
  return { ok: true };
}

export function classifyTemperature(celsius: number): Assessment {
  const t = round1(celsius);
  if (t < 35)
    return {
      level: 'bahaya',
      label: 'Terlalu dingin (hipotermia)',
      message: 'Suhu tubuh ini terlalu rendah dan bisa berbahaya.',
      advice: [
        'Pindah ke tempat hangat, ganti pakaian basah, dan selimuti tubuh.',
        'Segera ke IGD, terutama jika menggigil hebat, bingung, atau mengantuk berat.',
      ],
      emergency: true,
    };
  if (t < 36)
    return {
      level: 'perhatian',
      label: 'Agak rendah',
      message: 'Suhu tubuh ini sedikit di bawah normal.',
      advice: ['Hangatkan tubuh lalu ukur ulang. Pastikan termometer dipakai dengan benar.'],
    };
  if (t <= 37.5)
    return {
      level: 'normal',
      label: 'Normal',
      message: 'Suhu tubuh ini termasuk normal.',
      advice: ['Tidak perlu tindakan khusus.'],
    };
  if (t < 38)
    return {
      level: 'perhatian',
      label: 'Hangat',
      message: 'Suhu tubuh ini sedikit hangat.',
      advice: ['Istirahat, minum air yang cukup, dan ukur ulang beberapa jam lagi.'],
    };
  if (t < 40)
    return {
      level: 'perhatian',
      label: 'Demam',
      message: 'Suhu tubuh ini termasuk demam.',
      advice: [
        'Istirahat, banyak minum, dan kompres hangat.',
        'Obat penurun panas (misalnya parasetamol) bisa dipakai sesuai aturan pada kemasan.',
        'Periksa ke dokter jika demam 3 hari atau lebih, muncul bintik merah, mimisan, atau sangat lemas.',
      ],
    };
  return {
    level: 'bahaya',
    label: 'Demam sangat tinggi',
    message: 'Suhu tubuh ini sangat tinggi.',
    advice: [
      'Kompres hangat dan beri minum.',
      'Segera periksa ke dokter atau IGD, terutama jika kejang, sangat lemas, atau bingung.',
    ],
    emergency: true,
  };
}

/* ---------------------------------------------- Nadi / detak jantung */

export function validatePulse(bpm: number): Validation {
  if (!isNum(bpm) || bpm < 25 || bpm > 250)
    return { ok: false, error: 'Angka nadi harus antara 25 dan 250 kali per menit.' };
  return { ok: true };
}

/** Resting heart rate. Used by both the manual form and the camera measurement. */
export function classifyPulse(bpm: number): Assessment {
  const v = Math.round(bpm);
  if (v < 50)
    return {
      level: 'perhatian',
      label: 'Lambat',
      message: 'Detak jantung ini lebih lambat dari biasanya.',
      advice: [
        'Pada orang yang rutin berolahraga, angka ini bisa wajar.',
        'Periksa ke dokter jika disertai pusing, lemas, sesak, atau pernah pingsan.',
      ],
    };
  if (v <= 100)
    return {
      level: 'normal',
      label: 'Normal',
      message: 'Detak jantung saat istirahat ini termasuk normal.',
      advice: ['Tidak perlu tindakan khusus.'],
    };
  if (v <= 120)
    return {
      level: 'perhatian',
      label: 'Cepat',
      message: 'Detak jantung ini lebih cepat dari biasanya.',
      advice: [
        'Bisa karena baru bergerak, kopi, cemas, atau demam. Duduk tenang 5 menit lalu ukur ulang.',
        'Jika tetap cepat saat istirahat, sebaiknya periksa ke dokter.',
      ],
    };
  return {
    level: 'bahaya',
    label: 'Sangat cepat',
    message: 'Detak jantung saat istirahat ini sangat cepat.',
    advice: [
      'Duduk tenang 5 menit lalu ukur ulang.',
      'Jika tetap di atas 120 saat istirahat, sebaiknya diperiksa dokter hari ini.',
      'Segera ke IGD jika disertai nyeri dada, sesak, atau hampir pingsan.',
    ],
  };
}

/** Parse a user-typed number that may use a comma as decimal separator ("36,8"). */
export function parseNumber(s: string): number {
  const t = s.trim().replace(',', '.');
  if (t === '') return NaN;
  return Number(t);
}
