/** Family mode: a short status message the user sends to family themselves (WhatsApp / share). */
import type { Warning } from './earlyWarning';
import { formatDateTime, formatValue, TYPE_LABEL, type Entry } from './history';
import type { Profile } from './profile';

export function familyMessage(
  profile: Profile,
  entries: Entry[],
  warnings: Warning[],
  extra?: { missionsDone?: number; missionsTotal?: number; adherence?: number | null },
): string {
  const who = profile.name || 'Saya';
  const lines = [`Kabar kesehatan ${who} dari aplikasi Cek Sehat Mandiri:`];
  const latestByType = new Map<string, Entry>();
  for (const e of entries) if (!latestByType.has(e.type)) latestByType.set(e.type, e);
  for (const e of latestByType.values()) lines.push(`• ${TYPE_LABEL[e.type]}: ${formatValue(e)} (${e.label}, ${formatDateTime(e.time)})`);
  if (extra?.missionsTotal) lines.push(`• Misi sehat hari ini: ${extra.missionsDone ?? 0} dari ${extra.missionsTotal}`);
  if (extra?.adherence !== undefined && extra.adherence !== null) lines.push(`• Minum obat 7 hari terakhir: ${Math.round(extra.adherence * 100)}% tepat jadwal`);
  for (const w of warnings) lines.push(`⚠ ${w.title}. ${w.message}`);
  if (lines.length === 1) lines.push('Belum ada hasil pengukuran.');
  lines.push('(Ini alat bantu, bukan diagnosis dokter.)');
  return lines.join('\n');
}

/** wa.me link. Phone in international format without "+" (Indonesian 08… is converted to 628…). */
export function whatsappLink(phone: string | undefined, text: string): string {
  let p = (phone ?? '').replace(/[^0-9]/g, '');
  if (p.startsWith('0')) p = `62${p.slice(1)}`;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}
