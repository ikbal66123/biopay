import Anthropic from '@anthropic-ai/sdk';

declare const process: { env: Record<string, string | undefined> };
import { HttpError, MAX_BODY_BYTES, handleAi } from '../lib/aiHandler';

/**
 * POST /api/ai
 * Needs the environment variable ANTHROPIC_API_KEY (set in Netlify:
 * Site configuration → Environment variables). Optional APP_ACCESS_CODE:
 * when set, the app must send the same code, so strangers cannot spend
 * your API credit.
 */
const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { error: 'Gunakan POST.' });
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'Fitur AI belum diaktifkan: ANTHROPIC_API_KEY belum diisi di server.' });
  const code = process.env.APP_ACCESS_CODE;
  if (code && req.headers.get('x-access-code') !== code) return json(401, { error: 'Kode akses salah. Isi kode akses di menu Profil.' });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: 'Foto terlalu besar.' });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Permintaan tidak valid.' });
  }

  try {
    return json(200, await handleAi(body, new Anthropic()));
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: 'Layanan AI sedang sibuk. Coba lagi sebentar lagi.' });
    if (e instanceof Anthropic.AuthenticationError) return json(503, { error: 'API key di server tidak valid.' });
    if (e instanceof Anthropic.BadRequestError) return json(400, { error: 'Permintaan ditolak layanan AI.' });
    if (e instanceof Anthropic.APIError) return json(502, { error: 'Layanan AI sedang bermasalah. Coba lagi nanti.' });
    if (e instanceof Anthropic.APIConnectionError) return json(502, { error: 'Server tidak bisa menghubungi layanan AI.' });
    return json(500, { error: 'Terjadi kesalahan di server.' });
  }
};

export const config = { path: '/api/ai' };
