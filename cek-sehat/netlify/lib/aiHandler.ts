/** Server side of "Foto Makanan" (Netlify Function), so the API key can stay off the phone. */
import { analyzeFood, FoodError, type ParseClient } from '../../src/lib/ai/food';
import type { FoodRequest } from '../../src/lib/ai/schemas';

export const MAX_BODY_BYTES = 6_000_000; // ~4 MB image after base64
export { FoodError as HttpError };

export async function handleAi(body: unknown, client: ParseClient): Promise<unknown> {
  const req = body as FoodRequest;
  if (!req || typeof req !== 'object' || req.task !== 'makanan') throw new FoodError(400, 'Permintaan tidak valid.');
  if (!req.foto) throw new FoodError(400, 'Foto makanan belum ada.');
  const kondisi = Array.isArray(req.kondisi) ? req.kondisi.map((k) => String(k).slice(0, 60)) : [];
  return analyzeFood(client, req.foto, kondisi);
}
