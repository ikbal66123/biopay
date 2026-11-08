/** App side of the AI features: calls the server function at /api/ai. */
import { readPref, writePref } from '../prefs';
import type { Entry } from '../history';
import { formatDateTime, formatValue, TYPE_LABEL } from '../history';
import type { Medicine } from '../meds';
import { ageOf, CONDITION_LABEL, type Profile } from '../profile';
import type { AiRequest, PatientContext } from './schemas';

export const AI_ENDPOINT = '/api/ai';

export function hasAiConsent(): boolean {
  return readPref('ai:setuju') === '1';
}
export function setAiConsent(v: boolean) {
  writePref('ai:setuju', v ? '1' : '0');
}
export function getAccessCode(): string {
  return readPref('ai:kode') ?? '';
}
export function setAccessCode(code: string) {
  writePref('ai:kode', code.trim());
}

export class AiError extends Error {}

export async function askAi<T>(req: AiRequest, signal?: AbortSignal): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw new AiError('Tidak ada internet. Fitur AI butuh koneksi; fitur lain tetap bisa dipakai.');
  let res: Response;
  try {
    res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-access-code': getAccessCode() },
      body: JSON.stringify(req),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AiError('Tidak bisa terhubung ke server. Periksa internet Anda.');
  }
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json'))
    throw new AiError(
      'Fitur AI belum aktif di alamat ini. Aplikasi perlu di-deploy bersama server AI (lihat panduan di README).',
    );
  const data = await res.json();
  if (!res.ok) throw new AiError(data?.error ?? 'Terjadi kesalahan. Coba lagi.');
  return data as T;
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

/** What the AI gets to know: profile, medicines and the last week of measurements. */
export function buildContext(profile: Profile, entries: Entry[], meds: Medicine[], now = Date.now()): PatientContext {
  const week = now - 7 * 24 * 60 * 60 * 1000;
  return {
    usia: ageOf(profile),
    jenis_kelamin: profile.sex,
    kondisi: profile.conditions.map((c) => CONDITION_LABEL[c]),
    obat: meds.map((m) => [m.name, m.strength, `${m.timesPerDay}x sehari`].filter(Boolean).join(' ')),
    catatan: profile.notes,
    data_terbaru: entries
      .filter((e) => e.time >= week)
      .slice(0, 12)
      .map((e) => `${TYPE_LABEL[e.type]} ${formatValue(e)} (${e.label}, ${formatDateTime(e.time)})`),
  };
}
