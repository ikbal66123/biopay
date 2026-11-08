import { useMemo, useState } from 'react';
import { AiConsent, BackHome, Notice, Spinner } from '../components/Bits';
import { IconCamera, IconCheck, IconTrash } from '../components/Icons';
import { askAi, buildContext, hasAiConsent, resizeImage, setAiConsent } from '../lib/ai/client';
import type { ObatResult } from '../lib/ai/schemas';
import { adherence, DEFAULT_TIMES, dosesFor, loadDoseLog, loadMeds, saveDoseLog, saveMeds, type Medicine } from '../lib/meds';
import { dateKey } from '../lib/missions';
import { loadProfile } from '../lib/profile';
import { useHistory } from '../lib/useHistory';

const WITH_FOOD: Record<NonNullable<Medicine['withFood']>, string> = {
  sebelum: 'sebelum makan',
  sesudah: 'sesudah makan',
  bersama: 'bersama makan',
  bebas: 'kapan saja',
};

export default function MedicinePage() {
  const entries = useHistory();
  const profile = useMemo(loadProfile, []);
  const [consent, setConsent] = useState(hasAiConsent);
  const [meds, setMeds] = useState(loadMeds);
  const [log, setLog] = useState(loadDoseLog);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState<ObatResult | null>(null);
  const [draft, setDraft] = useState<{ name: string; strength: string; times: number; withFood: Medicine['withFood']; purpose: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const today = new Date();
  const doses = dosesFor(meds, log, today);
  const adh = adherence(meds, log, today);

  const analyze = async (dataUrl: string) => {
    setBusy(true);
    setError('');
    setFound(null);
    try {
      const r = await askAi<ObatResult>({ task: 'obat', foto: dataUrl, konteks: buildContext(profile, entries, meds) });
      setFound(r);
      if (r.terbaca)
        setDraft({
          name: r.nama,
          strength: r.kekuatan,
          times: Math.min(4, Math.max(1, r.kali_sehari ?? 1)),
          withFood: r.waktu_makan,
          purpose: '',
        });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!draft?.name.trim()) return;
    const m: Medicine = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      name: draft.name.trim(),
      ingredient: found?.kandungan,
      strength: draft.strength,
      timesPerDay: draft.times,
      times: DEFAULT_TIMES[draft.times],
      withFood: draft.withFood,
      purpose: draft.purpose,
      addedAt: Date.now(),
    };
    const list = [...meds, m];
    setMeds(list);
    saveMeds(list);
    setDraft(null);
    setFound(null);
  };

  const toggleDose = (key: string) => {
    const k = dateKey(today);
    const set = new Set(log[k] ?? []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    const next = { ...log, [k]: [...set] };
    setLog(next);
    saveDoseLog(next);
  };

  return (
    <div className="space-y-4">
      <BackHome />
      <header>
        <h1 className="text-2xl font-bold">Obat Saya</h1>
        <p className="mt-1 text-[15px] text-slate-600 dark:text-slate-400">Foto bungkus obat untuk membuat jadwal minum dan mengecek interaksi.</p>
      </header>

      {doses.length > 0 && (
        <section className="card space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Jadwal hari ini</h2>
            {adh !== null && <span className="text-sm text-slate-600 dark:text-slate-400">Tepat jadwal 7 hari: {Math.round(adh * 100)}%</span>}
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {doses.map((d) => (
              <li key={d.key}>
                <label className="flex items-center gap-3 py-2.5">
                  <input type="checkbox" className="h-6 w-6 accent-teal-700" checked={d.taken} onChange={() => toggleDose(d.key)} />
                  <span className="w-14 font-mono text-lg tabular-nums">{d.time}</span>
                  <span className={`flex-1 ${d.taken ? 'text-slate-400 line-through' : ''}`}>
                    {d.med.name} {d.med.strength}
                    {d.med.withFood && d.med.withFood !== 'bebas' && <span className="block text-xs text-slate-500">{WITH_FOOD[d.med.withFood]}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 dark:text-slate-400">Buka aplikasi ini sesuai jadwal. Pengingat otomatis di HP (notifikasi) butuh versi aplikasi dengan server.</p>
        </section>
      )}

      {!consent ? (
        <AiConsent
          onAccept={() => {
            setAiConsent(true);
            setConsent(true);
          }}
        />
      ) : (
        <section className="card space-y-2">
          <label className="btn-primary w-full cursor-pointer">
            <IconCamera width={20} height={20} /> Foto bungkus obat
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const d = await resizeImage(f, 1600).catch(() => null);
                if (d) void analyze(d);
              }}
            />
          </label>
          <button className="btn-secondary w-full" onClick={() => setDraft({ name: '', strength: '', times: 1, withFood: 'sesudah', purpose: '' })}>
            Tambah manual tanpa foto
          </button>
        </section>
      )}

      {busy && <Spinner label="Membaca bungkus obat…" />}
      {error && <Notice tone="warn">{error}</Notice>}

      {found && !found.terbaca && <Notice tone="warn">Tulisan pada foto belum terbaca jelas. Foto ulang dari dekat dengan cahaya cukup, atau tambah manual.</Notice>}

      {found?.terbaca && (
        <section className="card space-y-2 text-[15px]">
          <h2 className="text-lg font-bold">{found.nama}</h2>
          <p>
            {found.kandungan} {found.kekuatan && `· ${found.kekuatan}`}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Golongan: {found.golongan}. Umumnya untuk: {found.kegunaan_umum}
          </p>
          {found.aturan_pakai_kemasan && <p className="text-sm">Aturan pada kemasan: {found.aturan_pakai_kemasan}</p>}
          {found.peringatan.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {found.peringatan.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {found.interaksi.length > 0 && (
            <Notice tone="warn">
              <p className="font-semibold">Kemungkinan interaksi obat</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {found.interaksi.map((i) => (
                  <li key={i.dengan}>
                    Dengan {i.dengan}: {i.penjelasan}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-sm font-semibold">Tanyakan ke dokter atau apoteker sebelum mengubah apa pun.</p>
            </Notice>
          )}
          {found.kecocokan === 'perlu ditanyakan' && (
            <Notice tone="warn">
              {found.catatan_kecocokan} <b>Tanyakan ke dokter atau apoteker.</b> Jangan menghentikan obat resep tanpa arahan dokter.
              {profile.subscriber && ' Catatan ini juga diteruskan ke dokter langganan Anda (demo).'}
            </Notice>
          )}
        </section>
      )}

      {draft && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">Atur jadwal</h2>
          <div>
            <label htmlFor="obat-nama" className="label">
              Nama obat
            </label>
            <input id="obat-nama" className="input !text-base" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="obat-kekuatan" className="label">
              Kekuatan (opsional)
            </label>
            <input id="obat-kekuatan" className="input !text-base" placeholder="500 mg" value={draft.strength} onChange={(e) => setDraft({ ...draft, strength: e.target.value })} />
          </div>
          <fieldset>
            <legend className="label">Berapa kali sehari (sesuai resep dokter)</legend>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button key={n} className={`chip ${draft.times === n ? 'chip-on' : ''}`} aria-pressed={draft.times === n} onClick={() => setDraft({ ...draft, times: n })}>
                  {n}x
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">Jam: {DEFAULT_TIMES[draft.times].join(', ')}</p>
          </fieldset>
          <fieldset>
            <legend className="label">Diminum</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(WITH_FOOD) as NonNullable<Medicine['withFood']>[]).map((w) => (
                <button key={w} className={`chip ${draft.withFood === w ? 'chip-on' : ''}`} aria-pressed={draft.withFood === w} onClick={() => setDraft({ ...draft, withFood: w })}>
                  {WITH_FOOD[w]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-secondary" onClick={() => setDraft(null)}>
              Batal
            </button>
            <button className="btn-primary" onClick={save} disabled={!draft.name.trim()}>
              <IconCheck width={18} height={18} /> Simpan
            </button>
          </div>
        </section>
      )}

      {meds.length > 0 && (
        <section className="card">
          <h2 className="mb-1 text-lg font-bold">Daftar obat</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {meds.map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-2">
                <span className="flex-1">
                  <span className="font-semibold">{m.name}</span> {m.strength}
                  <span className="block text-sm text-slate-500">
                    {m.timesPerDay}x sehari · {m.times.join(', ')}
                  </span>
                </span>
                {confirmDel === m.id ? (
                  <>
                    <button className="btn-secondary !px-2 !py-1 text-sm" onClick={() => setConfirmDel(null)}>
                      Batal
                    </button>
                    <button
                      className="btn-danger !px-2 !py-1 text-sm"
                      onClick={() => {
                        const list = meds.filter((x) => x.id !== m.id);
                        setMeds(list);
                        saveMeds(list);
                        setConfirmDel(null);
                      }}
                    >
                      Hapus
                    </button>
                  </>
                ) : (
                  <button className="rounded p-2 text-slate-500 hover:text-red-600" aria-label={`Hapus ${m.name}`} onClick={() => setConfirmDel(m.id)}>
                    <IconTrash width={18} height={18} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
