import { useMemo } from 'react';
import Disclaimer from '../components/Disclaimer';
import { DemoBadge } from '../components/Bits';
import {
  IconAlert,
  IconBluetooth,
  IconChart,
  IconChat,
  IconDoctor,
  IconFood,
  IconMap,
  IconPhone,
  IconPill,
  IconTarget,
  IconUser,
  IconUsers,
  IconWallet,
} from '../components/Icons';
import VoiceAssistant from '../components/VoiceAssistant';
import { earlyWarnings } from '../lib/earlyWarning';
import { foodToday, loadFood } from '../lib/foodLog';
import { dosesFor, loadDoseLog, loadMeds } from '../lib/meds';
import { dailyMissions } from '../lib/missions';
import { doneOn, lastWeeklyCheck, totalPoints } from '../lib/missionStore';
import { loadProfile } from '../lib/profile';
import { familyMessage, whatsappLink } from '../lib/family';
import { useHistory } from '../lib/useHistory';

const FEATURES = [
  { href: '#tanya-ai', label: 'Tanya AI', desc: 'Ceritakan keluhan', Icon: IconChat },
  { href: '#dokter', label: 'Panggil Dokter', desc: 'Chat, video, ke rumah', Icon: IconDoctor },
  { href: '#foto-obat', label: 'Obat Saya', desc: 'Foto obat & pengingat', Icon: IconPill },
  { href: '#foto-makanan', label: 'Foto Makanan', desc: 'Perkiraan gizi', Icon: IconFood },
  { href: '#menu', label: 'Menu Hemat', desc: 'Sesuai kantong', Icon: IconWallet },
  { href: '#misi', label: 'Misi Harian', desc: 'Poin & hadiah', Icon: IconTarget },
  { href: '#alat', label: 'Alat Bluetooth', desc: 'Tensi, gula, oksimeter', Icon: IconBluetooth },
  { href: '#keluarga', label: 'Mode Keluarga', desc: 'Kabari keluarga', Icon: IconUsers },
  { href: '#profil', label: 'Profil', desc: 'Usia, penyakit', Icon: IconUser },
];

export default function HomePage() {
  const entries = useHistory();
  const profile = useMemo(loadProfile, []);
  const today = new Date();
  const warnings = useMemo(() => earlyWarnings(entries), [entries]);
  const food = foodToday(loadFood(), today);
  const missions = dailyMissions({
    conditions: profile.conditions,
    date: today,
    carbsToday: food.karbo,
    saltyFoodToday: food.asin,
    lastWeeklyCheck: lastWeeklyCheck(),
  });
  const done = doneOn(today);
  const doneCount = missions.filter((m) => done.has(m.id)).length;
  const nowHm = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
  const nextDose = dosesFor(loadMeds(), loadDoseLog(), today).find((d) => !d.taken && d.time >= nowHm);
  const hour = today.getHours();
  const greet = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-slate-600 dark:text-slate-400">{greet}{profile.name ? `, ${profile.name}` : ''}</p>
        <h1 className="text-2xl font-bold">Panggil dokter kapan saja, di mana saja</h1>
      </header>

      <a href="#darurat" className="flex items-center gap-3 rounded-2xl bg-red-600 p-4 text-white shadow hover:bg-red-700">
        <IconPhone width={28} height={28} />
        <span>
          <span className="block text-lg font-bold">Tombol Darurat</span>
          <span className="block text-sm text-red-50">Gratis. 112 · 119 · Basarnas 115, kirim lokasi</span>
        </span>
      </a>

      <VoiceAssistant />

      {warnings.length > 0 && (
        <section className="space-y-2" aria-label="Peringatan dini">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <IconAlert width={20} height={20} /> Peringatan dini
          </h2>
          {warnings.map((w) => (
            <div
              key={w.id}
              className={`rounded-2xl border p-3 ${
                w.level === 'bahaya'
                  ? 'border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100'
                  : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100'
              }`}
            >
              <p className="font-bold">{w.title}</p>
              <p className="mt-1 text-[15px]">{w.message}</p>
              {profile.familyPhone && (
                <a
                  className="mt-2 inline-block text-sm font-semibold underline"
                  href={whatsappLink(profile.familyPhone, familyMessage(profile, entries, [w]))}
                  target="_blank"
                  rel="noreferrer"
                >
                  Kabari {profile.familyName || 'keluarga'} lewat WhatsApp
                </a>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="grid grid-cols-2 gap-2">
        <a href="#misi" className="card !p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Misi hari ini</p>
          <p className="text-xl font-bold tabular-nums">
            {doneCount}/{missions.length}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{totalPoints()} poin</p>
        </a>
        <a href="#foto-obat" className="card !p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Obat berikutnya</p>
          {nextDose ? (
            <>
              <p className="text-xl font-bold tabular-nums">{nextDose.time}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{nextDose.med.name}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Tidak ada jadwal</p>
          )}
        </a>
      </section>

      <section aria-label="Fitur">
        <div className="grid grid-cols-3 gap-2">
          {FEATURES.map(({ href, label, desc, Icon }) => (
            <a key={href} href={href} className="card flex flex-col items-start gap-1 !p-3 hover:border-teal-500">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100">
                <Icon width={20} height={20} />
              </span>
              <span className="text-sm font-bold leading-tight">{label}</span>
              <span className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">{desc}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Untuk dokter & peneliti</h2>
        <a href="#dashboard-dokter" className="card flex items-center gap-3 !p-3">
          <IconChart width={22} height={22} />
          <span className="flex-1">
            <span className="block font-semibold">Dashboard dokter</span>
            <span className="block text-sm text-slate-600 dark:text-slate-400">Pantau pasien hijau/kuning/merah</span>
          </span>
          <DemoBadge />
        </a>
        <a href="#riset" className="card flex items-center gap-3 !p-3">
          <IconChart width={22} height={22} />
          <span className="flex-1">
            <span className="block font-semibold">Mode Riset</span>
            <span className="block text-sm text-slate-600 dark:text-slate-400">Uji akurasi detak jantung kamera</span>
          </span>
        </a>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Segera hadir</h2>
        <div className="card flex items-start gap-3 !p-3 opacity-80">
          <IconMap width={22} height={22} className="mt-0.5 shrink-0" />
          <p className="text-sm">
            <b>Peta waspada lingkungan</b> (data anonim per kelurahan, misalnya "kasus demam meningkat, waspada DBD") dan{' '}
            <b>integrasi SATUSEHAT & BPJS</b>. Keduanya butuh server, izin, dan kerja sama resmi.
          </p>
        </div>
      </section>

      <Disclaimer />
    </div>
  );
}
