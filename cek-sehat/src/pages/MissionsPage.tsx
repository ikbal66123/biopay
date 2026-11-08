import { useState } from 'react';
import { BackHome, DemoBadge, Notice } from '../components/Bits';
import { foodToday, loadFood } from '../lib/foodLog';
import { dailyMissions, needsDoctorApproval, streak } from '../lib/missions';
import { datesWithDone, doneOn, lastWeeklyCheck, toggleMission, totalPoints } from '../lib/missionStore';
import { CONDITION_LABEL, loadProfile } from '../lib/profile';

const REWARDS = [
  { points: 300, label: 'Diskon konsultasi dokter' },
  { points: 800, label: 'Cek lab sederhana gratis' },
];

export default function MissionsPage() {
  const profile = loadProfile();
  const today = new Date();
  const [, refresh] = useState(0);
  const food = foodToday(loadFood(), today);
  const missions = dailyMissions({
    conditions: profile.conditions,
    date: today,
    carbsToday: food.karbo,
    saltyFoodToday: food.asin,
    lastWeeklyCheck: lastWeeklyCheck(),
  });
  const done = doneOn(today);
  const points = totalPoints();
  const days = streak(datesWithDone(), today);

  return (
    <div className="space-y-4">
      <BackHome />
      <header>
        <h1 className="text-2xl font-bold">Misi Sehat Hari Ini</h1>
        <p className="mt-1 text-[15px] text-slate-600 dark:text-slate-400">
          {profile.conditions.length
            ? `Disesuaikan untuk: ${profile.conditions.map((c) => CONDITION_LABEL[c].toLowerCase()).join(', ')}.`
            : 'Misi dasar. Isi penyakit di Profil agar misi menyesuaikan.'}
        </p>
      </header>

      <section className="grid grid-cols-3 gap-2 text-center">
        <div className="card !p-3">
          <p className="text-2xl font-bold tabular-nums">
            {missions.filter((m) => done.has(m.id)).length}/{missions.length}
          </p>
          <p className="text-xs text-slate-500">selesai</p>
        </div>
        <div className="card !p-3">
          <p className="text-2xl font-bold tabular-nums">{points}</p>
          <p className="text-xs text-slate-500">poin</p>
        </div>
        <div className="card !p-3">
          <p className="text-2xl font-bold tabular-nums">{days}</p>
          <p className="text-xs text-slate-500">hari berturut</p>
        </div>
      </section>

      {needsDoctorApproval(profile.conditions) && (
        <Notice tone="info">
          <b>AI menyusun, dokter memastikan.</b>{' '}
          {profile.subscriber ? (
            <>
              Rencana misi ini menunggu persetujuan dokter langganan Anda. <DemoBadge />
            </>
          ) : (
            'Untuk penyakit kronis, tunjukkan rencana misi ini ke dokter Anda sebelum dijalankan.'
          )}
        </Notice>
      )}

      <ul className="card divide-y divide-slate-100 !py-1 dark:divide-slate-800">
        {missions.map((m) => (
          <li key={m.id}>
            <label className="flex cursor-pointer items-start gap-3 py-3">
              <input
                type="checkbox"
                className="mt-0.5 h-6 w-6 shrink-0 accent-teal-700"
                checked={done.has(m.id)}
                onChange={() => {
                  toggleMission(today, m.id, m.points);
                  refresh((n) => n + 1);
                }}
              />
              <span className="flex-1">
                <span className={`block text-[15px] font-medium ${done.has(m.id) ? 'text-slate-400 line-through' : ''}`}>{m.title}</span>
                {m.detail && <span className="block text-sm text-slate-500 dark:text-slate-400">{m.detail}</span>}
              </span>
              <span className="text-sm font-semibold tabular-nums text-teal-700 dark:text-teal-400">+{m.points}</span>
            </label>
          </li>
        ))}
      </ul>

      <section className="card space-y-2">
        <h2 className="flex items-center gap-2 font-bold">
          Hadiah poin <DemoBadge />
        </h2>
        {REWARDS.map((r) => (
          <div key={r.label}>
            <div className="flex justify-between text-sm">
              <span>{r.label}</span>
              <span className="tabular-nums">
                {Math.min(points, r.points)}/{r.points}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
              <div className="h-2 rounded-full bg-teal-600" style={{ width: `${Math.min(100, (points / r.points) * 100)}%` }} />
            </div>
          </div>
        ))}
      </section>

      <p className="text-xs text-slate-500 dark:text-slate-400">Misi mendukung pemulihan, bukan pengganti pengobatan. Ikuti anjuran dokter Anda.</p>
    </div>
  );
}
