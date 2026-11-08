/** The user's own health profile, stored only on this device. */
import { readPref, writePref } from './prefs';

export type Condition = 'hipertensi' | 'diabetes' | 'jantung' | 'demam';

export const CONDITION_LABEL: Record<Condition, string> = {
  hipertensi: 'Darah tinggi (hipertensi)',
  diabetes: 'Diabetes (kencing manis)',
  jantung: 'Penyakit jantung',
  demam: 'Sedang demam / DBD',
};

export interface Profile {
  name?: string;
  birthYear?: number;
  sex?: 'L' | 'P';
  conditions: Condition[];
  /** free text: allergies, other illnesses */
  notes?: string;
  /** monthly doctor subscription (demo) */
  subscriber?: boolean;
  /** family contact for alerts (WhatsApp number, with country code) */
  familyPhone?: string;
  familyName?: string;
}

const KEY = 'profil';

export function loadProfile(): Profile {
  try {
    const p = JSON.parse(readPref(KEY) ?? 'null');
    if (p && Array.isArray(p.conditions)) return p;
  } catch {
    /* ignore */
  }
  return { conditions: [] };
}

export function saveProfile(p: Profile) {
  writePref(KEY, JSON.stringify(p));
}

export function ageOf(p: Profile, now = new Date()): number | undefined {
  return p.birthYear ? now.getFullYear() - p.birthYear : undefined;
}
