/**
 * App side of "Foto Makanan".
 * Two ways to reach Claude:
 *  1. the user's own API key saved on this phone → the app calls Anthropic directly
 *     (works even when the app is uploaded with Netlify Drop);
 *  2. otherwise the server function at /api/ai (deploy from Git with ANTHROPIC_API_KEY set).
 */
import { readPref, writePref } from '../prefs';
import type { FoodRequest, MakananResult } from './schemas';

export const AI_ENDPOINT = '/api/ai';

export function hasAiConsent(): boolean {
  return readPref('ai:setuju') === '1';
}
export function setAiConsent(v: boolean) {
  writePref('ai:setuju', v ? '1' : '0');
}

export function getApiKey(): string {
  return readPref('ai:kunci') ?? '';
}
export function setApiKey(key: string) {
  writePref('ai:kunci', key.trim());
}
export function looksLikeApiKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim());
}

export class AiError extends Error {
  constructor(
    message: string,
    /** "setup": AI is not connected yet → show the API-key form */
    public kind: 'setup' | 'other' = 'other',
  ) {
    super(message);
  }
}

async function viaServer(req: FoodRequest): Promise<MakananResult> {
  let res: Response;
  try {
    res = await fetch(AI_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) });
  } catch {
    throw new AiError('Tidak bisa terhubung. Periksa internet Anda.');
  }
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw new AiError('AI belum terhubung. Isi API key di bagian Koneksi AI di bawah.', 'setup');
  const data = await res.json();
  if (res.status === 503) throw new AiError('AI belum terhubung. Isi API key di bagian Koneksi AI di bawah.', 'setup');
  if (!res.ok) throw new AiError(data?.error ?? 'Terjadi kesalahan. Coba lagi.');
  return data as MakananResult;
}

async function direct(key: string, req: FoodRequest): Promise<MakananResult> {
  // loaded only when needed, so the rest of the app stays small and offline
  const [{ default: Anthropic }, { analyzeFood, FoodError }] = await Promise.all([import('@anthropic-ai/sdk'), import('./food')]);
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
  try {
    return await analyzeFood(client, req.foto, req.kondisi);
  } catch (e) {
    if (e instanceof FoodError) throw new AiError(e.message);
    if (e instanceof Anthropic.AuthenticationError) throw new AiError('API key ditolak. Periksa lagi kuncinya.', 'setup');
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError('API key ini tidak punya izin. Periksa akun Anthropic Anda.', 'setup');
    if (e instanceof Anthropic.RateLimitError) throw new AiError('Layanan AI sedang sibuk atau saldo kredit habis. Coba lagi nanti.');
    if (e instanceof Anthropic.BadRequestError) throw new AiError('Permintaan ditolak. Periksa saldo kredit di akun Anthropic, atau coba foto lain.');
    if (e instanceof Anthropic.APIConnectionError) throw new AiError('Tidak bisa terhubung. Periksa internet Anda.');
    if (e instanceof Anthropic.APIError) throw new AiError('Layanan AI sedang bermasalah. Coba lagi nanti.');
    throw new AiError('Terjadi kesalahan. Coba lagi.');
  }
}

export async function analyzeFoodPhoto(foto: string, kondisi: string[]): Promise<MakananResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw new AiError('Tidak ada internet. Foto makanan butuh koneksi; fitur lain tetap bisa dipakai.');
  const req: FoodRequest = { task: 'makanan', foto, kondisi };
  const key = getApiKey();
  return key ? direct(key, req) : viaServer(req);
}

/** Downscale a photo before sending: smaller upload, same usefulness. */
export function resizeImage(file: File, max = 1280, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new AiError('Foto tidak bisa dibuka.'));
    };
    img.src = url;
  });
}
