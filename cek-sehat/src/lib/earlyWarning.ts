/**
 * Early warning: reads TRENDS in the saved history, not only today's number.
 * Messages describe the numbers and suggest an action; they never diagnose.
 */
import type { Entry } from './history';

export interface Warning {
  id: string;
  level: 'perhatian' | 'bahaya';
  title: string;
  message: string;
}

const DAY = 24 * 60 * 60 * 1000;

function dayKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Average value per calendar day, oldest first. */
function dailyAverages(entries: Entry[], pick: (e: Entry) => number | null, from: number, now: number) {
  const map = new Map<string, { t: number; sum: number; n: number }>();
  for (const e of entries) {
    if (e.time < from || e.time > now) continue;
    const v = pick(e);
    if (v === null) continue;
    const k = dayKey(e.time);
    const cur = map.get(k) ?? { t: e.time, sum: 0, n: 0 };
    cur.sum += v;
    cur.n++;
    cur.t = Math.max(cur.t, e.time);
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => a.t - b.t).map((d) => ({ t: d.t, v: d.sum / d.n }));
}

/** The last `n` daily values rise strictly and each comes from consecutive days. */
function risingDays(days: { t: number; v: number }[], n: number): boolean {
  if (days.length < n) return false;
  const last = days.slice(-n);
  for (let i = 1; i < n; i++) {
    if (!(last[i].v > last[i - 1].v)) return false;
    const gap = Math.round((startOfDay(last[i].t) - startOfDay(last[i - 1].t)) / DAY);
    if (gap !== 1) return false;
  }
  return true;
}

function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function earlyWarnings(entries: Entry[], now = Date.now()): Warning[] {
  const out: Warning[] = [];
  const last7 = now - 7 * DAY;

  // ---- blood pressure
  const sysDays = dailyAverages(entries, (e) => (e.type === 'tekanan' ? e.sys : null), now - 10 * DAY, now);
  if (risingDays(sysDays, 3) && sysDays[sysDays.length - 1].v >= 130) {
    out.push({
      id: 'tensi-naik',
      level: sysDays[sysDays.length - 1].v >= 160 ? 'bahaya' : 'perhatian',
      title: 'Tensi naik 3 hari berturut-turut',
      message:
        'Ada kemungkinan kondisi memburuk minggu ini. Ukur pagi dan malam, kurangi garam, minum obat sesuai anjuran, dan konsultasikan ke dokter.',
    });
  }
  const highBp = entries.filter((e) => e.type === 'tekanan' && e.time >= last7 && (e.sys >= 140 || e.dia >= 90));
  if (highBp.length >= 2 && !out.some((w) => w.id === 'tensi-naik')) {
    out.push({
      id: 'tensi-tinggi-berulang',
      level: 'perhatian',
      title: `Tensi tinggi ${highBp.length} kali dalam 7 hari`,
      message: 'Angka tensi berulang kali di atas 140/90. Sebaiknya periksa ke dokter dalam beberapa hari ini.',
    });
  }

  // ---- glucose
  const lowSugar = entries.filter((e) => e.type === 'gula' && e.time >= now - 3 * DAY && e.mgdl < 70);
  if (lowSugar.length) {
    out.push({
      id: 'gula-rendah',
      level: 'bahaya',
      title: 'Gula darah pernah terlalu rendah (di bawah 70)',
      message:
        'Gula rendah bisa berbahaya, terutama bagi pengguna insulin atau obat diabetes. Bicarakan dengan dokter apakah dosis obat perlu disesuaikan.',
    });
  }
  const highSugar = entries.filter(
    (e) => e.type === 'gula' && e.time >= last7 && (e.mgdl >= 200 || (e.timing === 'puasa' && e.mgdl >= 126)),
  );
  if (highSugar.length >= 2) {
    out.push({
      id: 'gula-tinggi-berulang',
      level: highSugar.some((e) => e.type === 'gula' && e.mgdl >= 300) ? 'bahaya' : 'perhatian',
      title: `Gula darah tinggi ${highSugar.length} kali dalam 7 hari`,
      message: 'Sebaiknya periksa ke dokter untuk menilai pengobatan dan pola makan.',
    });
  }

  // ---- resting heart rate
  const hrDays = dailyAverages(entries, (e) => (e.type === 'detak' ? e.bpm : null), now - 10 * DAY, now);
  if (risingDays(hrDays, 3) && hrDays[hrDays.length - 1].v > 100) {
    out.push({
      id: 'nadi-naik',
      level: 'perhatian',
      title: 'Detak jantung istirahat naik 3 hari berturut-turut',
      message: 'Detak jantung saat istirahat makin cepat. Jika disertai demam, lemas, atau sesak, periksa ke dokter.',
    });
  }

  // ---- fever
  const feverDays = new Set(
    entries.filter((e) => e.type === 'suhu' && e.celsius >= 38 && e.time >= now - 4 * DAY).map((e) => dayKey(e.time)),
  );
  if (feverDays.size >= 3) {
    out.push({
      id: 'demam-3-hari',
      level: 'perhatian',
      title: 'Demam tercatat 3 hari atau lebih',
      message:
        'Periksa ke dokter dan minta cek darah (trombosit) untuk waspada DBD atau tifus. Hindari ibuprofen dan aspirin sampai diperiksa.',
    });
  }
  // fever that just went down: in dengue this is when danger signs can appear
  const temps = entries.filter((e) => e.type === 'suhu' && e.time >= now - 7 * DAY).sort((a, b) => a.time - b.time);
  const latest = temps[temps.length - 1];
  const hadFever = temps.some((e) => e.type === 'suhu' && e.celsius >= 38 && e.time >= now - 6 * DAY && e.time < (latest?.time ?? 0));
  if (latest && latest.type === 'suhu' && latest.celsius < 37.5 && hadFever) {
    out.push({
      id: 'demam-turun',
      level: 'perhatian',
      title: 'Demam sudah turun, tetap waspada',
      message:
        'Jika ada kemungkinan DBD, masa setelah demam turun (sekitar hari ke-3 sampai ke-7) justru perlu diawasi. Segera ke IGD bila muncul nyeri perut hebat, muntah terus, mimisan atau gusi berdarah, sangat lemas, atau jarang buang air kecil.',
    });
  }

  // ---- weight loss
  const weights = entries.filter((e) => e.type === 'berat' && e.time >= now - 30 * DAY).sort((a, b) => a.time - b.time);
  if (weights.length >= 2) {
    const first = weights[0];
    const last = weights[weights.length - 1];
    if (first.type === 'berat' && last.type === 'berat' && (first.weightKg - last.weightKg) / first.weightKg >= 0.05) {
      out.push({
        id: 'berat-turun',
        level: 'perhatian',
        title: 'Berat badan turun 5% atau lebih dalam sebulan',
        message: 'Jika tidak sedang diet, penurunan berat tanpa sebab sebaiknya diperiksakan ke dokter.',
      });
    }
  }

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'bahaya' ? -1 : 1));
}
