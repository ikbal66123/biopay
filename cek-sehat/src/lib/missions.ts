/**
 * Daily health missions that adapt to the user's condition.
 * Missions support recovery; they never replace treatment.
 */
import type { Condition } from './profile';

export interface Mission {
  id: string;
  title: string;
  detail?: string;
  points: number;
}

// index = Date.getDay(): 0 Minggu … 6 Sabtu
const FRUIT_OF_DAY = ['melon', 'jeruk', 'pepaya', 'pisang', 'apel', 'semangka', 'jambu biji'];

export interface MissionContext {
  conditions: Condition[];
  date: Date;
  /** carbohydrate eaten today from food photos, grams */
  carbsToday?: number;
  /** salt-heavy food detected today from food photos */
  saltyFoodToday?: boolean;
  /** time of the last weekly check (ms), if any */
  lastWeeklyCheck?: number;
}

export function dailyMissions(ctx: MissionContext): Mission[] {
  const c = new Set(ctx.conditions);
  const fever = c.has('demam');
  const out: Mission[] = [];

  // ---- base missions (adjusted when ill)
  if (fever) {
    out.push({ id: 'minum-demam', title: 'Minum 2–3 liter hari ini', detail: 'Air putih, oralit, jus, kuah sup. Catat jika jarang buang air kecil.', points: 20 });
    out.push({ id: 'suhu-6jam', title: 'Catat suhu setiap 6 jam', detail: 'Simpan di Cek Angka → Suhu tubuh.', points: 15 });
    out.push({ id: 'istirahat', title: 'Istirahat penuh, jangan olahraga dulu', points: 10 });
    out.push({
      id: 'tanda-bahaya',
      title: 'Cek tanda bahaya hari ini',
      detail: 'Nyeri perut hebat, muntah terus, mimisan atau gusi berdarah, sangat lemas → segera ke IGD.',
      points: 15,
    });
  } else {
    if (c.has('jantung')) {
      out.push({ id: 'jalan-jantung', title: 'Jalan santai 20 menit', detail: 'Sesuai anjuran dokter. Berhenti jika nyeri dada atau sesak.', points: 15 });
    } else if (c.has('hipertensi')) {
      out.push({ id: 'jalan-30', title: 'Jalan santai 30 menit', points: 15 });
    } else {
      out.push({ id: 'langkah', title: 'Jalan 6.000 langkah', points: 15 });
    }
    out.push({ id: 'minum', title: 'Minum 8 gelas air putih', points: 10 });
  }

  const fruit = FRUIT_OF_DAY[ctx.date.getDay()];
  out.push({
    id: 'buah',
    title: `Makan buah hari ini: ${fruit}`,
    detail: c.has('diabetes') ? 'Satu porsi kecil (sekepalan tangan), bukan jus.' : undefined,
    points: 10,
  });
  if (!fever) out.push({ id: 'tidur', title: 'Tidur sebelum jam 11 malam', points: 10 });

  // ---- condition-specific
  if (c.has('hipertensi')) {
    out.push({ id: 'tensi-pagi', title: 'Cek tensi pagi', points: 10 });
    out.push({ id: 'tensi-malam', title: 'Cek tensi malam', points: 10 });
    out.push({
      id: 'garam',
      title: 'Garam maksimal 1 sendok teh sehari',
      detail: ctx.saltyFoodToday
        ? 'Tadi ada makanan asin. Untuk makan berikutnya pilih yang direbus atau dikukus, tanpa kecap asin dan kerupuk.'
        : 'Kurangi kecap asin, ikan asin, mi instan, dan kerupuk.',
      points: 15,
    });
  }
  if (c.has('diabetes')) {
    out.push({ id: 'foto-makan', title: 'Foto setiap makan untuk cek karbohidrat', points: 15 });
    out.push({ id: 'jalan-setelah-makan', title: 'Jalan 10 menit setelah makan', points: 10 });
    out.push({ id: 'cek-gula', title: 'Cek gula darah', points: 10 });
    if ((ctx.carbsToday ?? 0) > 180) {
      out.push({
        id: 'karbo-malam',
        title: 'Makan malam rendah karbohidrat',
        detail: `Karbohidrat hari ini sudah sekitar ${Math.round(ctx.carbsToday!)} gram. Nasi setengah porsi, perbanyak sayur dan lauk.`,
        points: 15,
      });
    }
  }
  if (c.has('jantung')) {
    out.push({ id: 'detak-pagi', title: 'Ukur detak jantung pagi hari', points: 10 });
  }
  if (c.size && !fever) out.push({ id: 'obat', title: 'Minum obat tepat waktu', detail: 'Lihat jadwal di menu Foto Obat.', points: 15 });

  // ---- weekly check (not mandatory; rewarded)
  const week = 7 * 24 * 60 * 60 * 1000;
  if (!ctx.lastWeeklyCheck || ctx.date.getTime() - ctx.lastWeeklyCheck >= week) {
    out.push({
      id: 'cek-mingguan',
      title: 'Cek kondisi mingguan',
      detail: 'Ukur detak jantung atau ceritakan keluhan ke AI. Tidak wajib, tapi dapat poin ekstra.',
      points: 30,
    });
  }
  return out;
}

/** Chronic conditions need the subscribed doctor's approval of the plan ("AI menyusun, dokter memastikan"). */
export function needsDoctorApproval(conditions: Condition[]): boolean {
  return conditions.some((c) => c === 'hipertensi' || c === 'diabetes' || c === 'jantung');
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Consecutive days (ending today or yesterday) with at least one completed mission. */
export function streak(doneDates: Set<string>, today: Date): number {
  const d = new Date(today);
  if (!doneDates.has(dateKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (doneDates.has(dateKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
