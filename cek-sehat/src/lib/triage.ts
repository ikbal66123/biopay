/**
 * Symptom triage. It only decides WHERE to go and HOW SOON, never what
 * illness someone has.
 */

export interface Symptom {
  id: string;
  label: string;
  hint?: string;
}

export const DANGER_SIGNS: Symptom[] = [
  { id: 'nyeri-dada', label: 'Nyeri dada', hint: 'Terasa berat atau menekan, bisa menjalar ke lengan kiri, rahang, atau punggung' },
  { id: 'sesak-berat', label: 'Sesak napas berat atau bibir kebiruan' },
  { id: 'stroke', label: 'Wajah mencong, lemas sebelah badan, atau bicara pelo' },
  { id: 'pingsan', label: 'Pingsan atau sangat bingung' },
  { id: 'kejang', label: 'Kejang' },
  { id: 'perdarahan', label: 'Perdarahan hebat yang sulit berhenti' },
  { id: 'muntah-darah', label: 'Muntah darah atau BAB hitam seperti aspal' },
  { id: 'sakit-kepala-hebat', label: 'Sakit kepala hebat yang datang tiba-tiba', hint: 'Terasa seperti sakit kepala terparah seumur hidup' },
];

export const MODERATE_SIGNS: Symptom[] = [
  { id: 'demam-3hari', label: 'Demam 3 hari atau lebih' },
  { id: 'demam-bintik', label: 'Demam disertai bintik merah di kulit atau mimisan', hint: 'Waspada demam berdarah (DBD)' },
  { id: 'dehidrasi', label: 'Diare atau muntah terus-menerus dengan tanda kurang cairan', hint: 'Sangat haus, mulut kering, jarang buang air kecil, lemas' },
  { id: 'nyeri-perut', label: 'Nyeri perut hebat' },
  { id: 'batuk-lama', label: 'Batuk lebih dari 2 minggu atau batuk berdarah' },
  { id: 'berat-turun', label: 'Berat badan turun tanpa sebab disertai sering haus atau sering buang air kecil' },
  { id: 'hamil', label: 'Sedang hamil dan ada keluhan', hint: 'Misalnya perdarahan, nyeri perut, bengkak, atau gerak janin berkurang' },
  { id: 'demam-usia-rentan', label: 'Demam pada lansia di atas 65 tahun atau bayi di bawah 3 bulan' },
];

export const MILD_SIGNS: Symptom[] = [
  { id: 'pilek', label: 'Pilek, bersin, atau hidung tersumbat' },
  { id: 'demam-ringan', label: 'Demam ringan kurang dari 3 hari' },
  { id: 'pegal', label: 'Pegal-pegal atau nyeri otot' },
];

export const HOME_CARE_TIPS: Record<string, string[]> = {
  pilek: [
    'Istirahat cukup dan minum air hangat.',
    'Hirup uap air hangat untuk melegakan hidung.',
    'Pakai masker agar tidak menular ke orang lain.',
  ],
  'demam-ringan': [
    'Banyak minum air putih dan istirahat.',
    'Kompres hangat di dahi atau ketiak.',
    'Obat penurun panas (misalnya parasetamol) bisa dipakai sesuai aturan pada kemasan.',
    'Ukur suhu 2–3 kali sehari.',
  ],
  pegal: [
    'Istirahatkan bagian yang pegal.',
    'Kompres hangat dan lakukan peregangan ringan.',
    'Minum air yang cukup.',
  ],
};

export const WHEN_TO_SEE_DOCTOR = [
  'Keluhan tidak membaik setelah 3 hari, atau malah makin berat.',
  'Demam 3 hari atau lebih, atau suhu 40 °C ke atas.',
  'Muncul bintik merah, mimisan, atau gusi berdarah.',
  'Sesak napas, nyeri dada, atau sangat lemas.',
  'Tidak bisa makan atau minum, atau jarang buang air kecil.',
];

export type TriageLevel = 'igd' | 'dokter24' | 'rumah' | 'kosong';

export interface TriageResult {
  level: TriageLevel;
  /** Labels of the symptoms that decided the level. */
  reasons: string[];
  /** Home-care tips (only for level "rumah"). */
  tips: string[];
}

const byId = (list: Symptom[]) => new Map(list.map((s) => [s.id, s]));
const DANGER = byId(DANGER_SIGNS);
const MODERATE = byId(MODERATE_SIGNS);
const MILD = byId(MILD_SIGNS);

/** The most serious group wins: one danger sign alone means "go to the IGD". */
export function triage(selectedIds: Iterable<string>): TriageResult {
  const ids = [...new Set(selectedIds)];
  const danger = ids.filter((id) => DANGER.has(id));
  if (danger.length)
    return { level: 'igd', reasons: danger.map((id) => DANGER.get(id)!.label), tips: [] };

  const moderate = ids.filter((id) => MODERATE.has(id));
  if (moderate.length)
    return { level: 'dokter24', reasons: moderate.map((id) => MODERATE.get(id)!.label), tips: [] };

  const mild = ids.filter((id) => MILD.has(id));
  if (mild.length)
    return {
      level: 'rumah',
      reasons: mild.map((id) => MILD.get(id)!.label),
      tips: [...new Set(mild.flatMap((id) => HOME_CARE_TIPS[id] ?? []))],
    };

  return { level: 'kosong', reasons: [], tips: [] };
}
