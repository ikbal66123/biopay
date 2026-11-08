import { useMemo, useState } from 'react';
import { AiConsent, BackHome, Notice, Spinner } from '../components/Bits';
import { IconCamera, IconCheck } from '../components/Icons';
import { askAi, buildContext, hasAiConsent, resizeImage, setAiConsent } from '../lib/ai/client';
import type { MakananResult } from '../lib/ai/schemas';
import { addFood, foodToday, loadFood } from '../lib/foodLog';
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

  const n = r?.per_porsi;
  const x = (v: number) => Math.round(v * portion);

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
                ['Protein', x(n.protein_g), 'g'],
                ['Lemak', x(n.lemak_g), 'g'],
                ['Serat', x(n.serat_g), 'g'],
                ['Gula', x(n.gula_g), 'g'],
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
          {r.vitamin_mineral.length > 0 && <p className="text-sm">Vitamin & mineral utama: {r.vitamin_mineral.join(', ')}</p>}
          {(r.tersembunyi.length > 0 || r.asin) && (
            <Notice tone="warn">
              {r.tersembunyi.length > 0 && <>Perhatikan: {r.tersembunyi.join(', ')}. </>}
              {r.asin && 'Makanan ini cenderung asin.'}
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
