import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import ResultCard from '../components/ResultCard';
import {
  GLUCOSE_TIMING_LABEL,
  calcBmi,
  classifyBloodPressure,
  classifyBmi,
  classifyGlucose,
  classifyPulse,
  classifyTemperature,
  parseNumber,
  validateBloodPressure,
  validateBmiInput,
  validateGlucose,
  validatePulse,
  validateTemperature,
  type GlucoseTiming,
  type Validation,
} from '../lib/classify';
import { addEntry, fmtDec } from '../lib/history';
import { readPref, writePref } from '../lib/prefs';

type Kind = 'imt' | 'tensi' | 'gula' | 'suhu' | 'nadi';

const KINDS: { id: Kind; label: string }[] = [
  { id: 'tensi', label: 'Tekanan darah' },
  { id: 'gula', label: 'Gula darah' },
  { id: 'imt', label: 'Berat & IMT' },
  { id: 'suhu', label: 'Suhu tubuh' },
  { id: 'nadi', label: 'Nadi' },
];

export default function CheckNumbersPage() {
  const [kind, setKind] = useState<Kind>(() => {
    const k = readPref('kind') as Kind | null;
    return KINDS.some((x) => x.id === k) ? (k as Kind) : 'tensi';
  });

  return (
    <div>
      <PageHeader title="Cek Angka" subtitle="Masukkan hasil pengukuran Anda, hasilnya langsung muncul." />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist">
        {KINDS.map((k) => (
          <button
            key={k.id}
            role="tab"
            aria-selected={kind === k.id}
            className={`chip shrink-0 ${kind === k.id ? 'chip-on' : ''}`}
            onClick={() => {
              setKind(k.id);
              writePref('kind', k.id);
            }}
          >
            {k.label}
          </button>
        ))}
      </div>
      {kind === 'imt' && <BmiForm />}
      {kind === 'tensi' && <BloodPressureForm />}
      {kind === 'gula' && <GlucoseForm />}
      {kind === 'suhu' && <TemperatureForm />}
      {kind === 'nadi' && <PulseForm />}
    </div>
  );
}

/* ------------------------------------------------------------ helpers */

function NumField(props: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  decimal?: boolean;
}) {
  return (
    <div>
      <label htmlFor={props.id} className="label">
        {props.label}
      </label>
      <div className="relative">
        <input
          id={props.id}
          className="input pr-16"
          inputMode={props.decimal ? 'decimal' : 'numeric'}
          autoComplete="off"
          placeholder={props.placeholder}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value.replace(/[^0-9.,]/g, ''))}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">
          {props.unit}
        </span>
      </div>
    </div>
  );
}

function ErrorText({ v }: { v: Validation }) {
  if (v.ok) return null;
  return (
    <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200" role="alert">
      {v.error}
    </p>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-600 dark:text-slate-400">{children}</p>;
}

/* -------------------------------------------------------------- forms */

function BmiForm() {
  const [w, setW] = useState('');
  const [h, setH] = useState(() => readPref('height') ?? '');
  const weight = parseNumber(w);
  const height = parseNumber(h);
  const filled = w !== '' && h !== '';
  const v = validateBmiInput(weight, height);
  const bmi = filled && v.ok ? calcBmi(weight, height) : null;
  const r = bmi !== null ? classifyBmi(bmi) : null;

  return (
    <div className="space-y-4">
      <div className="card grid grid-cols-2 gap-3">
        <NumField id="berat" label="Berat badan" unit="kg" value={w} onChange={setW} placeholder="60" decimal />
        <NumField
          id="tinggi"
          label="Tinggi badan"
          unit="cm"
          value={h}
          onChange={(x) => {
            setH(x);
            writePref('height', x);
          }}
          placeholder="160"
          decimal
        />
        <div className="col-span-2">
          <Tip>Klasifikasi IMT untuk orang dewasa menurut Kemenkes RI. Tidak untuk anak-anak dan ibu hamil.</Tip>
        </div>
      </div>
      {filled && <ErrorText v={v} />}
      {r && bmi !== null && (
        <ResultCard
          result={r}
          value={fmtDec(bmi)}
          unit="IMT"
          saveKey={`${w}|${h}`}
          onSave={() => addEntry({ type: 'berat', weightKg: weight, heightCm: height, bmi }, r.label, r.level)}
        />
      )}
    </div>
  );
}

function BloodPressureForm() {
  const [s, setS] = useState('');
  const [d, setD] = useState('');
  const sys = parseNumber(s);
  const dia = parseNumber(d);
  const filled = s !== '' && d !== '';
  const v = validateBloodPressure(sys, dia);
  const r = filled && v.ok ? classifyBloodPressure(sys, dia) : null;

  return (
    <div className="space-y-4">
      <div className="card grid grid-cols-2 gap-3">
        <NumField id="sis" label="Angka atas (sistolik)" unit="mmHg" value={s} onChange={setS} placeholder="120" />
        <NumField id="dia" label="Angka bawah (diastolik)" unit="mmHg" value={d} onChange={setD} placeholder="80" />
        <div className="col-span-2">
          <Tip>Ukur setelah duduk tenang 5 menit, lengan setinggi jantung, tidak sehabis merokok atau minum kopi.</Tip>
        </div>
      </div>
      {filled && <ErrorText v={v} />}
      {r && (
        <ResultCard
          result={r}
          value={`${sys}/${dia}`}
          unit="mmHg"
          saveKey={`${s}|${d}`}
          onSave={() => addEntry({ type: 'tekanan', sys, dia }, r.label, r.level)}
        />
      )}
    </div>
  );
}

function GlucoseForm() {
  const [g, setG] = useState('');
  const [timing, setTiming] = useState<GlucoseTiming>('sewaktu');
  const val = parseNumber(g);
  const v = validateGlucose(val);
  const r = g !== '' && v.ok ? classifyGlucose(val, timing) : null;

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <fieldset>
          <legend className="label">Kapan diukur?</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(GLUCOSE_TIMING_LABEL) as GlucoseTiming[]).map((t) => (
              <button
                key={t}
                className={`chip ${timing === t ? 'chip-on' : ''}`}
                aria-pressed={timing === t}
                onClick={() => setTiming(t)}
              >
                {GLUCOSE_TIMING_LABEL[t]}
              </button>
            ))}
          </div>
        </fieldset>
        <NumField id="gula" label="Gula darah" unit="mg/dL" value={g} onChange={setG} placeholder="100" decimal />
        <Tip>Jika alat Anda memakai satuan mmol/L, kalikan angkanya dengan 18.</Tip>
      </div>
      {g !== '' && <ErrorText v={v} />}
      {r && (
        <ResultCard
          result={r}
          value={fmtDec(val)}
          unit="mg/dL"
          saveKey={`${g}|${timing}`}
          onSave={() => addEntry({ type: 'gula', mgdl: val, timing }, r.label, r.level)}
        />
      )}
    </div>
  );
}

function TemperatureForm() {
  const [t, setT] = useState('');
  const c = parseNumber(t);
  const v = validateTemperature(c);
  const r = t !== '' && v.ok ? classifyTemperature(c) : null;

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <NumField id="suhu" label="Suhu tubuh" unit="°C" value={t} onChange={setT} placeholder="36,8" decimal />
        <Tip>Hasil dari ketiak biasanya sedikit lebih rendah daripada dari mulut atau telinga.</Tip>
      </div>
      {t !== '' && <ErrorText v={v} />}
      {r && (
        <ResultCard
          result={r}
          value={fmtDec(Math.round(c * 10) / 10)}
          unit="°C"
          saveKey={t}
          onSave={() => addEntry({ type: 'suhu', celsius: Math.round(c * 10) / 10 }, r.label, r.level)}
        />
      )}
    </div>
  );
}

function PulseForm() {
  const [p, setP] = useState('');
  const bpm = Math.round(parseNumber(p));
  const v = validatePulse(bpm);
  const r = p !== '' && v.ok ? classifyPulse(bpm) : null;

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <NumField id="nadi" label="Nadi saat istirahat" unit="x/menit" value={p} onChange={setP} placeholder="72" />
        <Tip>
          Dari tensimeter digital, oksimeter, atau hitung sendiri: raba nadi di pergelangan tangan, hitung selama 30
          detik, lalu kalikan 2.
        </Tip>
      </div>
      {p !== '' && <ErrorText v={v} />}
      {r && (
        <ResultCard
          result={r}
          value={String(bpm)}
          unit="bpm"
          saveKey={p}
          onSave={() => addEntry({ type: 'detak', bpm, source: 'manual' }, r.label, r.level)}
        />
      )}
    </div>
  );
}
