import { useMemo, useState } from 'react';
import { BackHome, DemoBadge, Notice } from '../components/Bits';
import { earlyWarnings } from '../lib/earlyWarning';
import { familyMessage, whatsappLink } from '../lib/family';
import { foodToday, loadFood } from '../lib/foodLog';
import { adherence, loadDoseLog, loadMeds } from '../lib/meds';
import { dailyMissions } from '../lib/missions';
import { doneOn, lastWeeklyCheck } from '../lib/missionStore';
import { loadProfile, saveProfile } from '../lib/profile';
import { useHistory } from '../lib/useHistory';

export default function FamilyPage() {
  const entries = useHistory();
  const [profile, setProfile] = useState(loadProfile);
  const [allowed, setAllowed] = useState(!!profile.familyPhone);
  const [name, setName] = useState(profile.familyName ?? '');
  const [phone, setPhone] = useState(profile.familyPhone ?? '');
  const [savedMsg, setSavedMsg] = useState('');

  const today = new Date();
  const missions = dailyMissions({
    conditions: profile.conditions,
    date: today,
    carbsToday: foodToday(loadFood(), today).karbo,
    lastWeeklyCheck: lastWeeklyCheck(),
  });
  const done = doneOn(today);
  const warnings = useMemo(() => earlyWarnings(entries), [entries]);
  const message = familyMessage(profile, entries, warnings, {
    missionsDone: missions.filter((m) => done.has(m.id)).length,
    missionsTotal: missions.length,
    adherence: adherence(loadMeds(), loadDoseLog(), today),
  });

  const save = () => {
    const p = { ...profile, familyName: name.trim() || undefined, familyPhone: allowed ? phone.trim() || undefined : undefined };
    setProfile(p);
    saveProfile(p);
    setSavedMsg('Tersimpan.');
  };

  return (
    <div className="space-y-4">
      <BackHome />
      <header>
        <h1 className="text-2xl font-bold">Mode Keluarga</h1>
        <p className="mt-1 text-[15px] text-slate-600 dark:text-slate-400">
          Kabari anak atau keluarga yang jauh tentang angka kesehatan, minum obat, dan misi Anda. Hanya dengan izin Anda.
        </p>
      </header>

      <section className="card space-y-3">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-teal-700" checked={allowed} onChange={(e) => setAllowed(e.target.checked)} />
          <span className="text-[15px]">Saya mengizinkan kabar kesehatan saya dikirim ke anggota keluarga ini.</span>
        </label>
        {allowed && (
          <>
            <div>
              <label htmlFor="kel-nama" className="label">
                Nama keluarga
              </label>
              <input id="kel-nama" className="input !text-base" placeholder="Misalnya: Rina (anak)" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="kel-wa" className="label">
                Nomor WhatsApp
              </label>
              <input id="kel-wa" className="input !text-base" inputMode="tel" placeholder="0812…" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9+ ]/g, ''))} />
            </div>
          </>
        )}
        <button className="btn-primary w-full" onClick={save}>
          Simpan
        </button>
        {savedMsg && <p className="text-sm text-emerald-700 dark:text-emerald-400">{savedMsg}</p>}
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">Pesan yang akan dikirim</h2>
        <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-sans text-sm dark:bg-slate-950">{message}</pre>
        <div className="grid gap-2">
          {profile.familyPhone && (
            <a className="btn-primary" href={whatsappLink(profile.familyPhone, message)} target="_blank" rel="noreferrer">
              Kirim ke {profile.familyName || 'keluarga'} lewat WhatsApp
            </a>
          )}
          {'share' in navigator && (
            <button
              className="btn-secondary"
              onClick={() => navigator.share({ title: 'Kabar kesehatan', text: message }).catch(() => {})}
            >
              Bagikan lewat aplikasi lain
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Saat ada peringatan dini di Beranda, muncul tombol "Kabari keluarga" agar Anda bisa langsung mengirimnya.
        </p>
      </section>

      <Notice tone="info">
        <DemoBadge>Tahap berikutnya</DemoBadge> Notifikasi otomatis ke HP keluarga dan dashboard keluarga butuh server dan akun. Saat ini
        Anda yang mengirim kabar sendiri, sehingga data tetap di tangan Anda.
      </Notice>
    </div>
  );
}
