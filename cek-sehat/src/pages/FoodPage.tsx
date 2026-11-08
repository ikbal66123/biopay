import { useMemo, useState } from 'react';
import { AiConsent, BackHome, Notice, Spinner } from '../components/Bits';
import { IconCamera, IconCheck } from '../components/Icons';
import { askAi, buildContext, hasAiConsent, resizeImage, setAiConsent } from '../lib/ai/client';
import type { MakananResult } from '../lib/ai/schemas';
import { addFood, foodToday, loadFood } from '../lib/foodLog';
import { limitUse, scale, shareWords } from '../lib/nutrition';
import { loadMeds } from '../lib/meds';
import { loadProfile } from '../lib/profile';
import { useHistory } from '../lib/useHistory';

const PORTIONS = [
  { v: 0.5, label: '½ piring' },
  { v: 1, label: '1 piring' },
  { v: 1.5, label: '1½ piring' },
  { v: 2, label: '2 piring' },
];

export default function FoodPage() {
  const entries = useHistory();
  const profile = useMemo(loadProfile, []);
  const [consent, setConsent] = useState(hasAiConsent);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [r, setR] = useState<MakananResult | null>(null);
  const [portion, setPortion] = useState(1);
  const [saved, setSaved] = useState(false);
  const [log, setLog] = useState(loadFood);
  const today = foodToday(log);

  const analyze = async (dataUrl: string) => {
    setBusy(true);
    setError('');
    setR(null);
    setSaved(false);
    setPortion(1);
    try {
      setR(await askAi<MakananResult>({ task: 'makanan', foto: dataUrl, konteks: buildContext(profile, entries, loadMeds()) }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const n = r ? scale(r.per_porsi, portion) : null;
  const x = (v: number) => Math.round(v);

  return (
    <div className="space-y-4">
      <BackHome />
      <header>
        <h1 className="text-2xl font-bold">Foto Makanan</h1>
        <p className="mt-1 text-[15px] text-slate-600 dark:text-slate-400">Foto piring Anda, AI memperkirakan kalori dan gizinya.</p>
      </header>

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
          <label className="btn-primary w-full cursor-pointer">
            <IconCamera width={20} height={20} /> {photo ? 'Foto ulang' : 'Foto makanan'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const d = await resizeImage(f).catch(() => null);
                if (d) {
                  setPhoto(d);
                  void analyze(d);
                }
              }}
            />
          </label>
        </section>
      )}

      {busy && <Spinner label="Menghitung perkiraan gizi…" />}
      {error && <Notice tone="warn">{error}</Notice>}

      {r && n && (
        <section className="card space-y-3">
          <div>
            <p className="text-sm text-slate-500">Terlihat</p>
            <p className="font-semibold">{r.makanan.map((m) => `${m.nama} (${m.porsi})`).join(', ')}</p>
          </div>
          <fieldset>
            <legend className="label">Porsi yang Anda makan</legend>
            <div className="flex flex-wrap gap-2">
              {PORTIONS.map((p) => (
                <button key={p.v} className={`chip ${portion === p.v ? 'chip-on' : ''}`} aria-pressed={portion === p.v} onClick={() => setPortion(p.v)}>
                  {p.label}
                </button>
              ))}
            </div>
          </fieldset>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ['Kalori', x(n.kalori), 'kkal'],
                ['Karbohidrat', x(n.karbohidrat_g), 'g'],
                ['Gula', x(n.gula_g), 'g'],
                ['Protein', x(n.protein_g), 'g'],
                ['Lemak', x(n.lemak_g), 'g'],
                ['Serat', x(n.serat_g), 'g'],
                ['Natrium', x(n.natrium_mg), 'mg'],
                ['Lemak jenuh', x(n.lemak_jenuh_g), 'g'],
                ['Kolesterol', x(n.kolesterol_mg), 'mg'],
              ] as const
            ).map(([k, v, u]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-2 dark:bg-slate-950">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="text-lg font-bold tabular-nums">
                  {v}
                  <span className="ml-0.5 text-xs font-normal">{u}</span>
                </dd>
              </div>
            ))}
          </dl>

          <div className="space-y-2">
            <h3 className="font-semibold">Dibanding batas sehari (Kemenkes)</h3>
            {limitUse(n).map((l) => (
              <div key={l.key}>
                <div className="flex justify-between text-sm">
                  <span>
                    {l.label}: <b className="tabular-nums">{x(l.amount)} {l.unit}</b> dari {l.limit} {l.unit}
                  </span>
                </div>
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
              <h3 className="font-semibold">Vitamin & mineral</h3>
              <ul className="mt-1 divide-y divide-slate-100 text-[15px] dark:divide-slate-800">
                {r.zat_gizi.map((z) => (
                  <li key={z.nama} className="flex items-center justify-between gap-2 py-1.5">
                    <span>{z.nama}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">
                        {String(Math.round(z.jumlah * portion * 10) / 10).replace('.', ',')} {z.satuan}
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
          <p className="text-[15px]">{r.saran}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Perkiraan (keyakinan {r.keyakinan}). Angka sebenarnya tergantung resep dan ukuran porsi.
          </p>
          <button
            className="btn-secondary w-full"
            disabled={saved}
            onClick={() => {
              addFood({
                time: Date.now(),
                names: r.makanan.map((m) => m.nama).join(', '),
                kalori: x(n.kalori),
                karbo: x(n.karbohidrat_g),
                protein: x(n.protein_g),
                lemak: x(n.lemak_g),
                gula: x(n.gula_g),
                asin: r.asin,
              });
              setLog(loadFood());
              setSaved(true);
            }}
          >
            {saved ? (
              <>
                <IconCheck width={18} height={18} /> Tercatat untuk hari ini
              </>
            ) : (
              'Catat sebagai makanan hari ini'
            )}
          </button>
        </section>
      )}

      {today.items.length > 0 && (
        <section className="card">
          <h2 className="font-bold">Hari ini</h2>
          <p className="text-[15px]">
            {Math.round(today.kalori)} kkal · karbohidrat {Math.round(today.karbo)} g · {today.items.length} kali makan
          </p>
          <p className="text-xs text-slate-500">Dipakai untuk menyesuaikan misi harian Anda.</p>
        </section>
      )}
    </div>
  );
}
