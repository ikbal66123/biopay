/**
 * Voice/text assistant: map what the user says to a screen.
 * Runs fully on the device (no AI needed), so it also works offline.
 * Keywords cover Indonesian plus common Javanese and Sundanese words.
 */

export type Route =
  | 'darurat'
  | 'jantung'
  | 'angka'
  | 'gejala'
  | 'tanya-ai'
  | 'dokter'
  | 'riwayat'
  | 'misi'
  | 'foto-makanan'
  | 'foto-obat'
  | 'menu'
  | 'alat'
  | 'keluarga'
  | 'profil';

export interface Intent {
  route: Route;
  /** what the assistant says back */
  reply: string;
  /** text to pre-fill (complaint for the AI) */
  prefill?: string;
  /** start the action right away (e.g. heart-rate measurement) */
  autostart?: boolean;
  /** for "Cek Angka": which form */
  kind?: 'tensi' | 'gula' | 'imt' | 'suhu' | 'nadi';
}

const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

const has = (t: string, words: string[]) => words.some((w) => t.includes(` ${w} `) || (w.includes(' ') && t.includes(w)));

/** Emergency phrases (Indonesian, Javanese, Sundanese). Checked first, always. */
const EMERGENCY = [
  'nyeri dada',
  'sakit dada',
  'dada sakit',
  'dada sesak',
  'dada nyeri',
  'sesak napas',
  'sesak nafas',
  'tidak bisa napas',
  'gak bisa napas',
  'ga bisa napas',
  'susah napas',
  'ora iso ambegan',
  'hese napas',
  'pingsan',
  'semaput',
  'kapiuhan',
  'kejang',
  'step',
  'stroke',
  'mencong',
  'pelo',
  'lumpuh',
  'tidak sadar',
  'gak sadar',
  'ora sadar',
  'muntah darah',
  'berak hitam',
  'bab hitam',
  'pendarahan',
  'perdarahan',
  'darah banyak',
  'kecelakaan',
  'tabrakan',
  'tenggelam',
  'keracunan',
  'bunuh diri',
  'darurat',
  'gawat',
  'ambulans',
  'ambulance',
];

const RULES: { words: string[]; make: (raw: string) => Intent }[] = [
  {
    words: ['detak jantung', 'denyut jantung', 'detak', 'denyut', 'jantung', 'heart rate', 'bpm'],
    make: () => ({ route: 'jantung', reply: 'Baik, saya buka pengukuran detak jantung. Tempelkan jari ke kamera belakang.', autostart: true }),
  },
  {
    words: ['tensi', 'tekanan darah', 'darah tinggi', 'darah rendah', 'hipertensi'],
    make: () => ({ route: 'angka', kind: 'tensi', reply: 'Baik, masukkan angka tensi Anda.' }),
  },
  {
    words: ['gula darah', 'gula', 'diabetes', 'kencing manis', 'sakit gula'],
    make: () => ({ route: 'angka', kind: 'gula', reply: 'Baik, masukkan angka gula darah Anda.' }),
  },
  {
    words: ['berat badan', 'timbang', 'imt', 'bmi', 'gemuk', 'kurus'],
    make: () => ({ route: 'angka', kind: 'imt', reply: 'Baik, masukkan berat dan tinggi badan Anda.' }),
  },
  {
    words: ['suhu', 'termometer', 'ukur panas'],
    make: () => ({ route: 'angka', kind: 'suhu', reply: 'Baik, masukkan suhu tubuh Anda.' }),
  },
  {
    words: ['panggil dokter', 'dokter', 'dokter ke rumah', 'video dokter', 'chat dokter', 'konsultasi', 'periksa'],
    make: () => ({ route: 'dokter', reply: 'Baik, saya buka layanan panggil dokter.' }),
  },
  {
    words: ['foto makanan', 'makanan', 'kalori', 'gizi', 'nutrisi', 'maem', 'tuang'],
    make: () => ({ route: 'foto-makanan', reply: 'Baik, silakan foto makanan Anda.' }),
  },
  {
    words: ['foto obat', 'obat', 'jadwal obat', 'minum obat', 'pil'],
    make: () => ({ route: 'foto-obat', reply: 'Baik, silakan foto bungkus obat Anda.' }),
  },
  {
    words: ['menu', 'murah', 'warteg', 'masak apa', 'makan apa', 'anggaran', 'budget'],
    make: () => ({ route: 'menu', reply: 'Baik, saya carikan menu sehat sesuai kantong.' }),
  },
  {
    words: ['misi', 'tantangan', 'target harian', 'langkah'],
    make: () => ({ route: 'misi', reply: 'Ini misi sehat Anda hari ini.' }),
  },
  {
    words: ['riwayat', 'hasil sebelumnya', 'grafik', 'catatan'],
    make: () => ({ route: 'riwayat', reply: 'Ini riwayat hasil pengukuran Anda.' }),
  },
  {
    words: ['bluetooth', 'alat ukur', 'sambungkan alat', 'oksimeter', 'smartwatch', 'jam pintar'],
    make: () => ({ route: 'alat', reply: 'Baik, saya buka menu sambungkan alat ukur.' }),
  },
  {
    words: ['keluarga', 'anak', 'kabari', 'bagikan'],
    make: () => ({ route: 'keluarga', reply: 'Baik, saya buka mode keluarga.' }),
  },
  {
    words: ['profil', 'data diri', 'umur saya'],
    make: () => ({ route: 'profil', reply: 'Baik, saya buka profil Anda.' }),
  },
  {
    words: ['cek gejala', 'centang gejala', 'daftar gejala'],
    make: () => ({ route: 'gejala', reply: 'Baik, centang gejala yang Anda rasakan.' }),
  },
];

/** Words that describe a complaint: send it to the AI complaint check, pre-filled. */
const COMPLAINT = [
  'sakit',
  'pusing',
  'mumet',
  'ngelu',
  'lieur',
  'nyeri',
  'demam',
  'panas',
  'meriang',
  'greges',
  'batuk',
  'pilek',
  'flu',
  'mual',
  'muntah',
  'diare',
  'mencret',
  'menceret',
  'lemas',
  'lemes',
  'gatal',
  'ruam',
  'bintik',
  'bengkak',
  'luka',
  'keluhan',
  'gejala',
  'kenapa',
  'mules',
  'perih',
  'linu',
  'pegal',
  'pegel',
  'berdebar',
  'deg degan',
  'sesak',
  'susah tidur',
  'ora enak',
  'teu raos',
  'gering',
  'lara',
  'nyeri',
];

export function isEmergency(text: string): boolean {
  return has(norm(text), EMERGENCY);
}

/** Decide where to go. Emergency always wins; then a specific feature; then a complaint. */
export function parseIntent(text: string): Intent | null {
  const t = norm(text);
  if (t.trim() === '') return null;
  if (has(t, EMERGENCY))
    return {
      route: 'darurat',
      reply: 'Ini keadaan darurat. Segera telepon 119 atau 112. Saya buka layar darurat.',
    };

  // "measure/check X" beats complaint words ("cek tensi karena pusing" → tensi)
  for (const r of RULES) if (has(t, r.words) && !(r.make('').route === 'dokter' && has(t, COMPLAINT))) return r.make(text);

  if (has(t, COMPLAINT))
    return {
      route: 'tanya-ai',
      prefill: text.trim(),
      reply: 'Baik, saya bantu periksa keluhan Anda. Lengkapi ceritanya jika perlu, lalu tekan Periksa.',
    };
  return null;
}

/** Speech recognition languages offered to the user. */
export const VOICE_LANGS: { code: string; label: string }[] = [
  { code: 'id-ID', label: 'Indonesia' },
  { code: 'jv-ID', label: 'Jawa' },
  { code: 'su-ID', label: 'Sunda' },
];
