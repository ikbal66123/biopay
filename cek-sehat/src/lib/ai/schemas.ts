/** Shape of the food-photo answer, shared by the server function and the app. */
import { z } from 'zod';

export const MakananSchema = z.object({
  makanan: z.array(z.object({ nama: z.string(), porsi: z.string() })),
  per_porsi: z.object({
    kalori: z.number(),
    karbohidrat_g: z.number(),
    gula_g: z.number(),
    serat_g: z.number(),
    protein_g: z.number(),
    lemak_g: z.number(),
    lemak_jenuh_g: z.number(),
    natrium_mg: z.number().describe('natrium (dari garam, kecap, penyedap)'),
    kolesterol_mg: z.number(),
  }),
  zat_gizi: z
    .array(
      z.object({
        nama: z.string().describe('vitamin atau mineral, misalnya Vitamin C, Vitamin A, Zat besi, Kalsium, Kalium'),
        jumlah: z.number(),
        satuan: z.enum(['mg', 'mcg']),
        tingkat: z.enum(['tinggi', 'sedang', 'rendah']).describe('dibanding kebutuhan harian orang dewasa'),
      }),
    )
    .describe('4 sampai 8 vitamin dan mineral yang paling menonjol'),
  tersembunyi: z.array(z.string()).describe('minyak, santan, gula, atau garam tersembunyi'),
  asin: z.boolean(),
  baik_untuk: z.array(z.string()).describe('hal baik dari makanan ini, singkat'),
  perlu_dibatasi: z.array(z.string()).describe('hal yang perlu dibatasi, terutama sesuai kondisi pengguna'),
  keyakinan: z.enum(['tinggi', 'sedang', 'rendah']),
  saran: z.string(),
});
export type MakananResult = z.infer<typeof MakananSchema>;

/** Request body for POST /api/ai. */
export interface FoodRequest {
  task: 'makanan';
  /** data URL of a JPEG/PNG/WebP photo */
  foto: string;
  /** user's conditions in plain words, e.g. ["Darah tinggi"] */
  kondisi?: string[];
}
