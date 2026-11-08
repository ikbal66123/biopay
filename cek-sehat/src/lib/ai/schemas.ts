/**
 * Shapes of the AI answers, shared by the server function (which asks Claude
 * for exactly this structure) and the app (which renders it).
 */
import { z } from 'zod';

export const TINGKAT = ['Kemungkinan besar', 'Mungkin', 'Kemungkinan kecil'] as const;

export const KeluhanSchema = z.object({
  darurat: z.boolean().describe('true jika ada tanda bahaya yang perlu segera ke IGD'),
  alasan_darurat: z.string().describe('kosong jika tidak darurat'),
  ringkasan: z.string().describe('1-2 kalimat ringkasan keluhan dengan bahasa sederhana'),
  kemungkinan: z
    .array(
      z.object({
        kondisi: z.string(),
        tingkat: z.enum(TINGKAT),
        alasan: z.string(),
      }),
    )
    .describe('2 sampai 4 kemungkinan, tanpa angka persen'),
  penanganan_awal: z.array(z.string()),
  ke_dokter_jika: z.array(z.string()),
  pertanyaan_lanjutan: z.array(z.string()).describe('pertanyaan yang membantu memperjelas, maksimal 3'),
  catatan_obat: z.string().describe('peringatan obat bebas jika relevan, misalnya hindari ibuprofen saat curiga DBD; kosong jika tidak ada'),
  saran_layanan: z.enum(['rawat di rumah', 'dokter dalam 24 jam', 'segera ke IGD']),
});
export type KeluhanResult = z.infer<typeof KeluhanSchema>;

export const MakananSchema = z.object({
  makanan: z.array(z.object({ nama: z.string(), porsi: z.string() })),
  per_porsi: z.object({
    kalori: z.number(),
    karbohidrat_g: z.number(),
    protein_g: z.number(),
    lemak_g: z.number(),
    serat_g: z.number(),
    gula_g: z.number(),
  }),
  vitamin_mineral: z.array(z.string()),
  tersembunyi: z.array(z.string()).describe('minyak, santan, gula, atau garam tersembunyi'),
  asin: z.boolean(),
  keyakinan: z.enum(['tinggi', 'sedang', 'rendah']),
  saran: z.string(),
});
export type MakananResult = z.infer<typeof MakananSchema>;

export const ObatSchema = z.object({
  terbaca: z.boolean().describe('false jika foto tidak jelas atau bukan obat'),
  nama: z.string(),
  kandungan: z.string(),
  kekuatan: z.string(),
  golongan: z.enum(['obat bebas', 'obat bebas terbatas', 'obat keras', 'jamu/herbal', 'tidak diketahui']),
  kegunaan_umum: z.string(),
  aturan_pakai_kemasan: z.string(),
  kali_sehari: z.number().nullable(),
  waktu_makan: z.enum(['sebelum', 'sesudah', 'bersama', 'bebas']),
  peringatan: z.array(z.string()),
  interaksi: z.array(z.object({ dengan: z.string(), penjelasan: z.string() })),
  kecocokan: z.enum(['lazim untuk kondisi pengguna', 'perlu ditanyakan', 'tidak diketahui']),
  catatan_kecocokan: z.string(),
});
export type ObatResult = z.infer<typeof ObatSchema>;

/* ------------------------------------------------------- request body */

export interface PatientContext {
  usia?: number;
  jenis_kelamin?: 'L' | 'P';
  kondisi?: string[];
  obat?: string[];
  catatan?: string;
  /** recent measurements, already formatted ("Tekanan darah 150/95 mmHg (kemarin 08:00)") */
  data_terbaru?: string[];
  gejala_dicentang?: string[];
}

export type AiRequest =
  | { task: 'keluhan'; keluhan: string; konteks: PatientContext; foto?: string }
  | { task: 'chat'; konteks: PatientContext; ringkasan: string; pesan: { role: 'user' | 'assistant'; text: string }[] }
  | { task: 'makanan'; foto: string; konteks: PatientContext }
  | { task: 'obat'; foto: string; konteks: PatientContext };

/** Remove "98%"-style certainty claims; the app never shows them. */
export function stripPercentClaims(text: string): string {
  return text
    .replace(/\(?\s*(?:sekitar\s+|kira-kira\s+|±\s*)?\d{1,3}(?:[.,]\d+)?\s?%\s*\)?/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

export function sanitizeKeluhan(r: KeluhanResult): KeluhanResult {
  const s = stripPercentClaims;
  return {
    ...r,
    alasan_darurat: s(r.alasan_darurat),
    ringkasan: s(r.ringkasan),
    kemungkinan: r.kemungkinan.slice(0, 4).map((k) => ({ ...k, kondisi: s(k.kondisi), alasan: s(k.alasan) })),
    penanganan_awal: r.penanganan_awal.map(s),
    ke_dokter_jika: r.ke_dokter_jika.map(s),
    pertanyaan_lanjutan: r.pertanyaan_lanjutan.slice(0, 3).map(s),
    catatan_obat: s(r.catatan_obat),
    saran_layanan: r.darurat ? 'segera ke IGD' : r.saran_layanan,
  };
}
