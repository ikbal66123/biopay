import { useCallback, useEffect, useState } from 'react';
import { IconDownload, IconTrash } from '../components/Icons';
import PageHeader from '../components/PageHeader';
import { parseNumber } from '../lib/classify';
import { readPref, writePref } from '../lib/prefs';
import type { PpgResult, Sample } from '../lib/ppg';
import { agreement, verdict, type Agreement } from '../lib/research/agreement';
import {
  REF_DEVICE_LABEL,
  clearRecords,
  compactSignal,
  deleteRecord,
  listRecords,
  newParticipantCode,
  newRecordId,
  recordsToCsv,
  saveRecord,
  type Condition,
  type Participant,
  type RefDevice,
  type ResearchRecord,
} from '../lib/research/store';
import HeartRatePage from './HeartRatePage';

const APP_VERSION = '1.1.0';
const AGE_GROUPS = ['< 18', '18–39', '40–59', '≥ 60'];

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = () => new Date().toISOString().slice(0, 10);
const f1 = (n: number) => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toString().replace('.', ',') : '–');
const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : '–');

function loadParticipant(): Participant {
  try {
    const p = JSON.parse(readPref('riset:peserta') ?? 'null');
    if (p?.code) return p;
  } catch {
    /* ignore */
  }
  return { code: newParticipantCode() };
}

export default function ResearchPage() {
  const [participant, setParticipantState] = useState<Participant>(loadParticipant);
  const [consent, setConsent] = useState(false);
  const [condition, setCondition] = useState<Condition>('istirahat');
  const [refDevice, setRefDevice] = useState<RefDevice>(() => (readPref('riset:alat') as RefDevice) || 'oksimeter');
  const [pending, setPending] = useState<{ samples: Sample[]; res: PpgResult } | null>(null);
  const [refValue, setRefValue] = useState('');
  const [records, setRecords] = useState<ResearchRecord[]>([]);
  const [savedMsg, setSavedMsg] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [measureKey, setMeasureKey] = useState(0);

  const refresh = useCallback(() => void listRecords().then(setRecords), []);
  useEffect(refresh, [refresh]);

  const setParticipant = (p: Participant) => {
    setParticipantState(p);
    writePref('riset:peserta', JSON.stringify(p));
  };

  const ref = Math.round(parseNumber(refValue));
  const refOk = Number.isFinite(ref) && ref >= 25 && ref <= 250;

  const save = async () => {
    if (!pending || !refOk) return;
    const { samples, res } = pending;
    await saveRecord({
      id: newRecordId(),
      time: Date.now(),
      participant,
      condition,
      ref: { bpm: ref, device: refDevice },
      app: {
        bpm: res.bpm,
        bpmPeaks: res.bpmPeaks,
        bpmFft: res.bpmFft,
        quality: res.quality,
        reason: res.reason,
        channel: res.channel,
      },
      signal: compactSignal(samples),
      userAgent: navigator.userAgent,
      appVersion: APP_VERSION,
    });
    setPending(null);
    setRefValue('');
    setSavedMsg(
      res.bpm === null
        ? 'Tersimpan. Aplikasi menolak pengukuran ini; itu juga data penting.'
        : `Tersimpan. Selisih: ${res.bpm - ref > 0 ? '+' : ''}${res.bpm - ref} bpm.`,
    );
    setMeasureKey((k) => k + 1);
    refresh();
  };

  const a = agreement(records.map((r) => ({ app: r.app.bpm, ref: r.ref.bpm })));
  const v = verdict(a);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mode Riset"
        subtitle="Uji akurasi detak jantung kamera dengan membandingkannya dengan alat lain. Data tetap di HP ini sampai Anda mengekspornya."
      />

      <section className="card space-y-3 text-[15px]">
        <h2 className="text-lg font-bold">1. Peserta</h2>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Kode peserta (tanpa nama)</p>
            <p className="font-mono text-xl font-bold">{participant.code}</p>
          </div>
          <button
            className="btn-secondary !py-2 text-sm"
            onClick={() => {
              setParticipant({ code: newParticipantCode() });
              setConsent(false);
            }}
          >
            Peserta baru
          </button>
        </div>
        <ChipRow
          label="Kelompok usia"
          options={AGE_GROUPS.map((g) => [g, g])}
          value={participant.ageGroup}
          onChange={(ageGroup) => setParticipant({ ...participant, ageGroup })}
        />
        <ChipRow
          label="Jenis kelamin"
          options={[
            ['L', 'Laki-laki'],
            ['P', 'Perempuan'],
          ]}
          value={participant.sex}
          onChange={(sex) => setParticipant({ ...participant, sex: sex as 'L' | 'P' })}
        />
        <ChipRow
          label="Warna kulit (opsional; akurasi kamera bisa dipengaruhi)"
          options={[
            ['terang', 'Terang'],
            ['sedang', 'Sedang'],
            ['gelap', 'Gelap'],
          ]}
          value={participant.skinTone}
          onChange={(t) => setParticipant({ ...participant, skinTone: t as Participant['skinTone'] })}
        />
        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
          <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-teal-700" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            Peserta sudah diberi penjelasan dan <b>setuju</b> hasil pengukurannya (tanpa nama) dipakai untuk penelitian.
          </span>
        </label>
      </section>

      <section className="card space-y-3 text-[15px]">
        <h2 className="text-lg font-bold">2. Alat pembanding</h2>
        <ChipRow
          label="Alat"
          options={(Object.keys(REF_DEVICE_LABEL) as RefDevice[]).map((d) => [d, REF_DEVICE_LABEL[d]])}
          value={refDevice}
          onChange={(d) => {
            setRefDevice(d as RefDevice);
            writePref('riset:alat', d);
          }}
        />
        <ChipRow
          label="Kondisi"
          options={[
            ['istirahat', 'Istirahat'],
            ['setelah-aktivitas', 'Setelah aktivitas'],
          ]}
          value={condition}
          onChange={(c) => setCondition(c as Condition)}
        />
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Pasang oksimeter di jari tangan <b>lain</b>, lalu ukur dengan aplikasi pada saat yang sama. Begitu selesai,
          langsung catat angka di oksimeter.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">3. Ukur</h2>
        {!consent ? (
          <p className="card text-[15px] text-slate-600 dark:text-slate-400">Centang persetujuan peserta di langkah 1 untuk mulai.</p>
        ) : pending ? (
          <div className="card space-y-3">
            <p className="text-[15px]">
              Aplikasi:{' '}
              <b>{pending.res.bpm !== null ? `${pending.res.bpm} bpm` : `ditolak (${pending.res.reason ?? 'sinyal kurang jelas'})`}</b>
            </p>
            <div>
              <label htmlFor="ref" className="label">
                Angka di {REF_DEVICE_LABEL[refDevice].toLowerCase()} (bpm)
              </label>
              <input
                id="ref"
                className="input"
                inputMode="numeric"
                autoFocus
                value={refValue}
                onChange={(e) => setRefValue(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="72"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  setPending(null);
                  setMeasureKey((k) => k + 1);
                }}
              >
                Buang
              </button>
              <button className="btn-primary" disabled={!refOk} onClick={save}>
                Simpan data
              </button>
            </div>
          </div>
        ) : (
          <>
            {savedMsg && (
              <p className="rounded-xl bg-emerald-50 p-3 text-[15px] text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100" role="status">
                {savedMsg}
              </p>
            )}
            <HeartRatePage
              key={measureKey}
              embedded
              onMeasured={(samples, res) => {
                setSavedMsg('');
                setPending({ samples, res });
              }}
            />
          </>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">4. Hasil uji akurasi</h2>
        <Stats a={a} />
        <p
          className={`rounded-xl p-3 text-[15px] ${
            v.level === 'baik'
              ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
              : v.level === 'kurang'
                ? 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100'
                : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
          }`}
        >
          {v.text}
        </p>
        {a.n >= 2 && <BlandAltman records={records} a={a} />}

        {records.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-primary" onClick={() => download(`riset-ringkas-${today()}.csv`, recordsToCsv(records), 'text/csv;charset=utf-8')}>
                <IconDownload width={18} height={18} /> CSV ringkas
              </button>
              <button
                className="btn-secondary"
                onClick={() =>
                  download(
                    `riset-lengkap-${today()}.json`,
                    JSON.stringify({ format: 'cek-sehat-riset', version: 1, exportedAt: new Date().toISOString(), records }),
                    'application/json',
                  )
                }
              >
                <IconDownload width={18} height={18} /> Data lengkap
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              CSV untuk Excel. "Data lengkap" (JSON) berisi sinyal mentah kamera untuk memperbaiki algoritma.
            </p>

            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {[...records].reverse().slice(0, 15).map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-2">
                  <span className="font-mono">{r.participant.code}</span>
                  <span className="flex-1 tabular-nums">
                    {r.app.bpm ?? 'ditolak'} vs {r.ref.bpm}
                    {r.app.bpm !== null && (
                      <span className="text-slate-500"> ({r.app.bpm - r.ref.bpm > 0 ? '+' : ''}{r.app.bpm - r.ref.bpm})</span>
                    )}
                  </span>
                  <button
                    className="rounded p-1.5 text-slate-500 hover:text-red-600"
                    aria-label={`Hapus data ${r.participant.code}`}
                    onClick={() => deleteRecord(r.id).then(refresh)}
                  >
                    <IconTrash width={16} height={16} />
                  </button>
                </li>
              ))}
            </ul>

            {confirmClear ? (
              <div className="rounded-xl border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/40">
                <p className="text-sm font-semibold">Hapus semua {records.length} data riset? Ekspor dulu jika masih diperlukan.</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button className="btn-secondary" onClick={() => setConfirmClear(false)}>
                    Batal
                  </button>
                  <button
                    className="btn-danger"
                    onClick={() =>
                      clearRecords().then(() => {
                        setConfirmClear(false);
                        refresh();
                      })
                    }
                  >
                    Ya, hapus
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-secondary w-full text-red-700 dark:text-red-400" onClick={() => setConfirmClear(true)}>
                <IconTrash width={18} height={18} /> Hapus semua data riset
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function ChipRow(props: { label: string; options: [string, string][]; value?: string; onChange: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="label">{props.label}</legend>
      <div className="flex flex-wrap gap-2">
        {props.options.map(([val, text]) => (
          <button
            key={val}
            type="button"
            aria-pressed={props.value === val}
            className={`chip ${props.value === val ? 'chip-on' : ''}`}
            onClick={() => props.onChange(val)}
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Stats({ a }: { a: Agreement }) {
  const items: [string, string, string][] = [
    ['Pengukuran', String(a.total), `${a.rejected} ditolak (${a.total ? pct(a.rejected / a.total) : '–'})`],
    ['Rata-rata selisih', `${f1(Math.abs(a.mae))} bpm`, 'MAE'],
    ['Bias', `${a.bias > 0 ? '+' : ''}${f1(a.bias)} bpm`, a.bias > 0 ? 'aplikasi cenderung lebih tinggi' : 'aplikasi cenderung lebih rendah'],
    ['Dalam standar AAMI', pct(a.withinAami), 'selisih ≤ 5 bpm atau ≤ 10%'],
  ];
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 gap-2">
        {items.map(([k, val, hint]) => (
          <div key={k} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
            <dt className="text-xs text-slate-500 dark:text-slate-400">{k}</dt>
            <dd className="text-xl font-bold tabular-nums">{val}</dd>
            <dd className="text-xs text-slate-500 dark:text-slate-400">{hint}</dd>
          </div>
        ))}
      </dl>
      {a.n >= 3 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Batas kesepakatan 95%: {f1(a.loaLow)} sampai {f1(a.loaHigh)} bpm. Artinya 95% hasil kamera diperkirakan berada
          dalam rentang ini dari angka alat pembanding.
        </p>
      )}
    </div>
  );
}

/** Bland–Altman plot: difference vs mean, with bias and 95% limits. */
function BlandAltman({ records, a }: { records: ResearchRecord[]; a: Agreement }) {
  const pts = records
    .filter((r) => r.app.bpm !== null)
    .map((r) => ({ m: ((r.app.bpm as number) + r.ref.bpm) / 2, d: (r.app.bpm as number) - r.ref.bpm }));
  const W = 340,
    H = 200,
    P = { l: 34, r: 10, t: 10, b: 28 };
  const xs = pts.map((p) => p.m);
  const x0 = Math.floor(Math.min(...xs, 60) / 10) * 10;
  const x1 = Math.ceil(Math.max(...xs, 100) / 10) * 10;
  const lim = Math.max(10, ...pts.map((p) => Math.abs(p.d)), Math.abs(a.loaLow), Math.abs(a.loaHigh)) * 1.1;
  const x = (v: number) => P.l + ((v - x0) / (x1 - x0)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v + lim) / (2 * lim)) * (H - P.t - P.b);
  const lines: [number, string, string][] = [
    [0, 'stroke-slate-300 dark:stroke-slate-700', ''],
    [a.bias, 'stroke-teal-600', 'bias'],
    ...(Number.isFinite(a.sd)
      ? ([
          [a.loaHigh, 'stroke-amber-500', '+1,96 SD'],
          [a.loaLow, 'stroke-amber-500', '−1,96 SD'],
        ] as [number, string, string][])
      : []),
  ];
  const yTicks = [-Math.round(lim * 0.8), 0, Math.round(lim * 0.8)];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Grafik Bland-Altman: selisih terhadap rata-rata kedua alat">
        {yTicks.map((t) => (
          <text key={t} x={P.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[10px] tabular-nums">
            {t > 0 ? `+${t}` : t}
          </text>
        ))}
        {lines.map(([v, cls, label]) => (
          <g key={label || 'zero'}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} className={cls} strokeDasharray={label && label !== 'bias' ? '4 4' : undefined} strokeWidth={1.5} />
            {label && (
              <text x={W - P.r} y={y(v) - 4} textAnchor="end" className="fill-slate-500 text-[9px]">
                {label}
              </text>
            )}
          </g>
        ))}
        {[x0, (x0 + x1) / 2, x1].map((t, i) => (
          <text key={t} x={x(t)} y={H - 10} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} className="fill-slate-500 text-[10px]">
            {Math.round(t)}
          </text>
        ))}
        {pts.map((p, i) => (
          <circle key={i} cx={x(p.m)} cy={y(p.d)} r={3.5} className="fill-teal-700 dark:fill-teal-400" fillOpacity={0.75} />
        ))}
      </svg>
      <figcaption className="text-xs text-slate-500 dark:text-slate-400">
        Sumbu datar: rata-rata kedua alat (bpm). Sumbu tegak: selisih aplikasi − pembanding. Titik yang makin dekat ke garis
        tengah berarti makin akurat.
      </figcaption>
    </figure>
  );
}
