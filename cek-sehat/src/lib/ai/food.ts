/**
 * The one Claude call behind "Foto Makanan". Used by the server function and,
 * when the user saved their own API key, directly from the phone.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { MakananSchema, type MakananResult } from './schemas';

export const MODEL = 'claude-opus-5-5';
export const BETAS = ['server-side-fallback-2026-07-01'];

export const FOOD_SYSTEM = `Anda ahli gizi di aplikasi "Cek Sehat Mandiri" untuk orang awam di Indonesia.
- Kenali setiap makanan dan minuman pada foto, lalu perkirakan gizinya untuk SATU porsi seperti yang terlihat: kalori, karbohidrat, gula, serat, protein, lemak, lemak jenuh, natrium, kolesterol, serta 4-8 vitamin dan mineral yang paling menonjol beserta jumlahnya.
- Perhatikan minyak goreng, santan, gula, kecap, dan garam tersembunyi pada masakan Indonesia. Pakai pengetahuan gizi umum (misalnya Tabel Komposisi Pangan Indonesia).
- Semua angka adalah perkiraan; isi keyakinan dengan jujur. Jika foto bukan makanan, isi makanan dengan daftar kosong dan keyakinan rendah.
- Gunakan Bahasa Indonesia sederhana. Jangan memberi diagnosis penyakit.`;

export class FoodError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Only what is needed from the SDK client, so tests can pass a fake. */
export interface ParseClient {
  beta: { messages: { parse: Anthropic['beta']['messages']['parse'] } };
}

export function imageBlock(dataUrl: string): Anthropic.Beta.BetaImageBlockParam {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new FoodError(400, 'Format foto tidak dikenali.');
  return { type: 'image', source: { type: 'base64', media_type: m[1] as 'image/jpeg', data: m[2] } };
}

export async function analyzeFood(client: ParseClient, foto: string, kondisi: string[] = []): Promise<MakananResult> {
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: BETAS,
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(MakananSchema) },
    system: FOOD_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          imageBlock(foto),
          {
            type: 'text',
            text: `Kondisi pengguna: ${kondisi.length ? kondisi.slice(0, 8).join(', ') : 'tidak disebutkan'}.\n\nKenali makanan pada foto ini, perkirakan gizinya, dan beri satu saran singkat sesuai kondisi pengguna.`,
          },
        ],
      },
    ],
  });
  if (res.stop_reason === 'refusal') throw new FoodError(422, 'Foto ini tidak bisa dianalisis. Coba foto lain.');
  if (res.stop_reason === 'max_tokens' || !res.parsed_output) throw new FoodError(502, 'Jawaban AI tidak lengkap. Coba lagi.');
  return res.parsed_output as MakananResult;
}
