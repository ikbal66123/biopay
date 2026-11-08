import { useState } from 'react';
import { BackHome, DemoBadge } from '../components/Bits';
import { getAccessCode, hasAiConsent, setAccessCode, setAiConsent } from '../lib/ai/client';
import { CONDITION_LABEL, loadProfile, saveProfile, type Condition, type Profile } from '../lib/profile';

export default function ProfilePage() {
  const [p, setP] = useState<Profile>(loadProfile);
  const [code, setCode] = useState(getAccessCode);
  const [aiOk, setAiOk] = useState(hasAiConsent);
  const [saved, setSaved] = useState(false);
  const year = new Date().getFullYear();

  const update = (patch: Partial<Profile>) => {
    setP((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };

  return (
    <div className="space-y-4">
      <BackHome />
      <header>
        <h1 className="text-2xl font-bold">Profil</h1>
        <p className="mt-1 text-[15px] text-slate-600 dark:text-slate-400">
          Dipakai untuk menyesuaikan misi, menu, dan analisis AI. Disimpan hanya di HP ini.
        </p>
      </header>

      <section className="card space-y-3">
        <div>
          <label htmlFor="p-nama" className="label">
            Nama panggilan
          </label>
          <input id="p-nama" className="input !text-base" value={p.name ?? ''} onChange={(e) => update({ name: e.target.value || undefined })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="p-lahir" className="label">
              Tahun lahir
            </label>
            <input
              id="p-lahir"
              className="input !text-base"
              inputMode="numeric"
              placeholder="1960"
              value={p.birthYear ?? ''}
              onChange={(e) => {
                const v = Number(e.target.value.replace(/\D/g, '').slice(0, 4));
                update({ birthYear: v >= 1900 && v <= year ? v : undefined });
              }}
            />
          </div>
          <fieldset>
            <legend className="label">Jenis kelamin</legend>
            <div className="flex gap-2">
              {(['L', 'P'] as const).map((s) => (
                <button key={s} className={`chip ${p.sex === s ? 'chip-on' : ''}`} aria-pressed={p.sex === s} onClick={() => update({ sex: s })}>
                  {s === 'L' ? 'Laki-laki' : 'Perempuan'}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <fieldset>
          <legend className="label">Penyakit yang sedang dialami</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CONDITION_LABEL) as Condition[]).map((c) => (
              <button
                key={c}
                className={`chip ${p.conditions.includes(c) ? 'chip-on' : ''}`}
                aria-pressed={p.conditions.includes(c)}
                onClick={() => update({ conditions: p.conditions.includes(c) ? p.conditions.filter((x) => x !== c) : [...p.conditions, c] })}
              >
                {CONDITION_LABEL[c]}
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="p-catatan" className="label">
            Alergi atau penyakit lain (opsional)
          </label>
          <textarea id="p-catatan" className="input min-h-[70px] !text-base" value={p.notes ?? ''} onChange={(e) => update({ notes: e.target.value || undefined })} />
        </div>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="h-5 w-5 shrink-0 accent-teal-700" checked={!!p.subscriber} onChange={(e) => update({ subscriber: e.target.checked })} />
          Pelanggan dokter langganan <DemoBadge />
        </label>
        <button
          className="btn-primary w-full"
          onClick={() => {
            saveProfile(p);
            setSaved(true);
          }}
        >
          {saved ? 'Tersimpan' : 'Simpan profil'}
        </button>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">Fitur AI</h2>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 accent-teal-700"
            checked={aiOk}
            onChange={(e) => {
              setAiOk(e.target.checked);
              setAiConsent(e.target.checked);
            }}
          />
          Saya setuju data yang saya pilih dikirim ke layanan AI untuk dianalisis
        </label>
        <div>
          <label htmlFor="p-kode" className="label">
            Kode akses server AI (jika diminta)
          </label>
          <input
            id="p-kode"
            className="input !text-base"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setAccessCode(e.target.value);
            }}
          />
          <p className="mt-1 text-xs text-slate-500">Diberikan oleh pengelola aplikasi, agar server AI tidak dipakai orang lain.</p>
        </div>
      </section>
    </div>
  );
}
