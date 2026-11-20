import { useRef, useState, useSyncExternalStore } from 'react';
import { AiConsent, Notice, Spinner } from '../components/Bits';
import Disclaimer from '../components/Disclaimer';
import PageHeader from '../components/PageHeader';
import { IconCamera, IconCheck, IconTrash } from '../components/Icons';
import { addMeal, deleteMeal, loadMeals, mealsOn, subscribeMeals, totals } from '../lib/foodLog';
import { AiError, analyzeFoodPhoto, getApiKey, hasAiConsent, looksLikeApiKey, resizeImage, setAiConsent, setApiKey } from '../lib/ai/client';
import type { MakananResult } from '../lib/ai/schemas';
import { limitUse, scale, shareWords, type PerPorsi } from '../lib/nutrition';
import { readPref, writePref } from '../lib/prefs';

const CONDITIONS = ['Darah tinggi', 'Diabetes', 'Penyakit jantung', 'Kolesterol tinggi', 'Hamil', 'Sedang demam'];

const PORTIONS = [
  { v: 0.5, label: '½ piring' },
  { v: 1, label: '1 piring' },
  { v: 1.5, label: '1½ piring' },
  { v: 2, label: '2 piring' },
];

const dec = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

function loadConditions(): string[] {
  try {
    const v = JSON.parse(readPref('makanan:kondisi') ?? '[]');
    return Array.isArray(v) ? v.filter((x) => CONDITIONS.includes(x)) : [];
  } catch {
    return [];
  }
}

export default function FoodPage() {
  const [consent, setConsent] = useState(hasAiConsent);
  const [conditions, setConditions] = useState<string[]>(loadConditions);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needSetup, setNeedSetup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [r, setR] = useState<MakananResult | null>(null);
  const [portion, setPortion] = useState(1);
  const [saved, setSaved] = useState(false);
  const resultRef = useRef<HTMLElement>(null);

  const analyze = async (dataUrl: string) => {
    setBusy(true);
    setError('');
    setNeedSetup(false);
    setR(null);
    setPortion(1);
    try {
      setR(await analyzeFoodPhoto(dataUrl, conditions));
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e) {
      if (e instanceof AiError && e.kind === 'setup') {
        setNeedSetup(true);
        setShowSettings(true);
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const d = await resizeImage(f).catch(() => null);
    if (!d) {
      setError('Foto tidak bisa dibuka. Coba foto lain.');
      return;
    }
    setPhoto(d);
    setSaved(false);
    void analyze(d);
  };

  const n = r ? scale(r.per_porsi, portion) : null;

  return (
    <div className="space-y-4">
      <PageHeader title="Foto Makanan" subtitle="Foto makanan Anda. AI mengenali makanannya dan memperkirakan kalori, gula, garam, lemak, serta vitamin dan mineralnya." />

      {!consent ? (
        <AiConsent
          onAccept={() => {
            setAiConsent(true);
            setConsent(true);
          }}
        />
      ) : (
        <section className="card space-y-3">
          {photo && <img src={photo} alt="Foto makanan" className="max-h-60 w-full rounded-xl object-cover" />}
          <div className="grid grid-cols-2 gap-2">
            <label className={`btn-primary cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>
              <IconCamera width={20} height={20} /> {photo ? 'Foto ulang' : 'Kamera'}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onFile} />
            </label>
            <label className={`btn-secondary cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>
              Dari galeri
              <input type="file" accept="image/*" className="sr-only" onChange={onFile} />
            </label>
          </div>
          <fieldset>
            <legend className="label">Kondisi Anda (opsional, agar saran menyesuaikan)</legend>
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map((c) => (
                <button
                  key={c}
                  className={`chip ${conditions.includes(c) ? 'chip-on' : ''}`}
                  aria-pressed={conditions.includes(c)}
                  onClick={() => {
                    const next = conditions.includes(c) ? conditions.filter((x) => x !== c) : [...conditions, c];
                    setConditions(next);
                    writePref('makanan:kondisi', JSON.stringify(next));
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </fieldset>
          {photo && !busy && (
            <button className="btn-secondary w-full" onClick={() => analyze(photo)}>
              Analisis ulang
            </button>
          )}
        </section>
      )}

      {busy && <Spinner label="AI sedang melihat makanan Anda… (bisa 10–60 detik)" />}
      {error && <Notice tone="warn">{error}</Notice>}

      {consent && (
        <AiSettings
          open={showSettings || needSetup}
          highlight={needSetup}
          onToggle={() => setShowSettings((v) => !v)}
          onSaved={() => {
            setNeedSetup(false);
            setError('');
            if (photo) void analyze(photo);
          }}
        />
      )}

      {r && n && (
        <section ref={resultRef} className="card space-y-4">
          {r.makanan.length ? (
            <div>
              <p className="text-sm text-slate-500">Terdeteksi</p>
              <p className="font-semibold">{r.makanan.map((m) => `${m.nama} (${m.porsi})`).join(', ')}</p>
            </div>
          ) : (
            <Notice tone="warn">Makanan tidak dikenali. Coba foto lebih dekat dengan cahaya cukup.</Notice>
          )}

          <fieldset>
            <legend className="label">Porsi yang Anda makan</legend>
            <div className="flex flex-wrap gap-2">
              {PORTIONS.map((p) => (
                <button
                  key={p.v}
                  className={`chip ${portion === p.v ? 'chip-on' : ''}`}
                  aria-pressed={portion === p.v}
                  onClick={() => {
                    setPortion(p.v);
                    setSaved(false);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </fieldset>

          <dl className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ['Kalori', n.kalori, 'kkal'],
                ['Karbohidrat', n.karbohidrat_g, 'g'],
                ['Gula', n.gula_g, 'g'],
                ['Protein', n.protein_g, 'g'],
                ['Lemak', n.lemak_g, 'g'],
                ['Serat', n.serat_g, 'g'],
                ['Natrium', n.natrium_mg, 'mg'],
                ['Lemak jenuh', n.lemak_jenuh_g, 'g'],
                ['Kolesterol', n.kolesterol_mg, 'mg'],
              ] as const
            ).map(([k, v, u]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-2 dark:bg-slate-950">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="text-lg font-bold tabular-nums">
                  {Math.round(v)}
                  <span className="ml-0.5 text-xs font-normal">{u}</span>
                </dd>
              </div>
            ))}
          </dl>

          <div className="space-y-2">
            <h2 className="font-semibold">Dibanding batas sehari (Kemenkes)</h2>
            {limitUse(n).map((l) => (
              <div key={l.key}>
                <p className="text-sm">
                  {l.label}: <b className="tabular-nums">{Math.round(l.amount)} {l.unit}</b> dari {l.limit} {l.unit}
                </p>
                <div className="mt-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className={`h-2 rounded-full ${l.level === 'bahaya' ? 'bg-red-500' : l.level === 'perhatian' ? 'bg-amber-400' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, l.share * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{shareWords(l.share)}</p>
              </div>
            ))}
          </div>

          {r.zat_gizi.length > 0 && (
            <div>
              <h2 className="font-semibold">Vitamin & mineral</h2>
              <ul className="mt-1 divide-y divide-slate-100 text-[15px] dark:divide-slate-800">
                {r.zat_gizi.map((z) => (
                  <li key={z.nama} className="flex items-center justify-between gap-2 py-1.5">
                    <span>{z.nama}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">
                        {dec(z.jumlah * portion)} {z.satuan}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          z.tingkat === 'tinggi'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                            : z.tingkat === 'sedang'
                              ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {z.tingkat}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r.baik_untuk.length > 0 && (
            <Notice tone="ok">
              <p className="font-semibold">Yang baik</p>
              <ul className="list-disc pl-5 text-sm">
                {r.baik_untuk.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </Notice>
          )}
          {(r.perlu_dibatasi.length > 0 || r.tersembunyi.length > 0 || r.asin) && (
            <Notice tone="warn">
              <p className="font-semibold">Perlu dibatasi</p>
              <ul className="list-disc pl-5 text-sm">
                {r.perlu_dibatasi.map((t) => (
                  <li key={t}>{t}</li>
                ))}
                {r.tersembunyi.length > 0 && <li>Tersembunyi: {r.tersembunyi.join(', ')}</li>}
                {r.asin && <li>Makanan ini cenderung asin.</li>}
              </ul>
            </Notice>
          )}
          {r.saran && <p className="text-[15px]">{r.saran}</p>}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Perkiraan (keyakinan {r.keyakinan}). Angka sebenarnya tergantung resep dan ukuran porsi.
          </p>
          {r.makanan.length > 0 && (
            <button
              className="btn-secondary w-full"
              disabled={saved}
              onClick={() => {
                addMeal(r.makanan.map((m) => m.nama).join(', '), portion, n);
                setSaved(true);
              }}
            >
              {saved ? (
                <>
                  <IconCheck width={18} height={18} /> Tercatat di makan hari ini
                </>
              ) : (
                'Catat sebagai makan hari ini'
              )}
            </button>
          )}
          <Disclaimer>Hasil ini perkiraan, bukan pengganti saran dokter atau ahli gizi.</Disclaimer>
        </section>
      )}

      <TodayMeals />
    </div>
  );
}

function AiSettings(props: { open: boolean; highlight: boolean; onToggle: () => void; onSaved: () => void }) {
  const [key, setKey] = useState(getApiKey);
  const [saved, setSaved] = useState(!!getApiKey());
  const valid = looksLikeApiKey(key);

  return (
    <section className={`card space-y-3 ${props.highlight ? '!border-amber-400' : ''}`}>
      <button className="flex w-full items-center justify-between text-left" onClick={props.onToggle} aria-expanded={props.open}>
        <span>
          <span className="block font-bold">Koneksi AI</span>
          <span className="block text-sm text-slate-600 dark:text-slate-400">{saved ? 'Terhubung dengan API key Anda' : 'Belum terhubung'}</span>
        </span>
        <span className="text-sm font-semibold text-teal-700 dark:text-teal-400">{props.open ? 'Tutup' : 'Atur'}</span>
      </button>
      {props.open && (
        <div className="space-y-3 text-[15px]">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>
              Buka <b>console.anthropic.com</b>, daftar atau masuk, lalu isi saldo kredit (bayar sesuai pemakaian).
            </li>
            <li>
              Pilih menu <b>API Keys</b> → <b>Create Key</b>, lalu salin kuncinya (diawali <code>sk-ant-</code>).
            </li>
            <li>Tempel di bawah, lalu tekan Simpan.</li>
          </ol>
          <div>
            <label htmlFor="api-key" className="label">
              API key Anthropic
            </label>
            <input
              id="api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="input !text-base"
              placeholder="sk-ant-..."
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setSaved(false);
              }}
            />
            {key && !valid && <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">Kunci Anthropic biasanya diawali "sk-ant-".</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-secondary"
              onClick={() => {
                setApiKey('');
                setKey('');
                setSaved(false);
              }}
            >
              Hapus
            </button>
            <button
              className="btn-primary"
              disabled={!valid}
              onClick={() => {
                setApiKey(key);
                setSaved(true);
                props.onSaved();
              }}
            >
              Simpan
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Kunci hanya disimpan di HP ini dan hanya dikirim ke Anthropic. Jangan bagikan kunci ke orang lain, dan pakai aplikasi ini di HP
            pribadi. Untuk aplikasi yang dipakai banyak orang, pasang kunci di server (lihat README).
          </p>
        </div>
      )}
    </section>
  );
}

function TodayMeals() {
  const meals = useSyncExternalStore(subscribeMeals, loadMeals, loadMeals);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const today = mealsOn(meals, Date.now());
  if (!today.length) return null;
  const t: PerPorsi = totals(today);
  const time = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <section className="card space-y-3" aria-label="Makan hari ini">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">Makan hari ini</h2>
        <span className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">{Math.round(t.kalori)} kkal</span>
      </div>
      <div className="space-y-2">
        {limitUse(t).map((l) => (
          <div key={l.key}>
            <p className="text-sm">
              {l.label}: <b className="tabular-nums">{Math.round(l.amount)} {l.unit}</b> dari {l.limit} {l.unit} sehari
            </p>
            <div className="mt-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className={`h-2 rounded-full ${l.share >= 1 ? 'bg-red-500' : l.share > 0.75 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, l.share * 100)}%` }}
              />
            </div>
          </div>
        ))}
        {limitUse(t).some((l) => l.share >= 1) && (
          <Notice tone="warn">Hari ini sudah melewati batas sehari. Untuk makan berikutnya, pilih yang direbus atau dikukus, tanpa minuman manis.</Notice>
        )}
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {today.map((m) => (
          <li key={m.id} className="flex items-center gap-2 py-2 text-[15px]">
            <span className="w-12 shrink-0 font-mono text-sm tabular-nums text-slate-500">{time(m.time)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{m.names}</span>
              <span className="block text-xs text-slate-500">
                {Math.round(m.gizi.kalori)} kkal · gula {Math.round(m.gizi.gula_g)} g · natrium {Math.round(m.gizi.natrium_mg)} mg
              </span>
            </span>
            {confirmId === m.id ? (
              <>
                <button className="btn-secondary !px-2 !py-1 text-sm" onClick={() => setConfirmId(null)}>
                  Batal
                </button>
                <button
                  className="btn-danger !px-2 !py-1 text-sm"
                  onClick={() => {
                    deleteMeal(m.id);
                    setConfirmId(null);
                  }}
                >
                  Hapus
                </button>
              </>
            ) : (
              <button className="rounded p-2 text-slate-500 hover:text-red-600" aria-label={`Hapus ${m.names}`} onClick={() => setConfirmId(m.id)}>
                <IconTrash width={18} height={18} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500 dark:text-slate-400">Batas sehari Kemenkes: gula 50 g, natrium 2000 mg (± 1 sendok teh garam), lemak 67 g.</p>
    </section>
  );
}
