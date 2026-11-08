import { useMemo, useState } from 'react';
import { BackHome, DemoBadge, Notice } from '../components/Bits';
import { IconChat, IconDoctor, IconHome } from '../components/Icons';
import { LEVEL_STYLE, LevelIcon } from '../components/ResultCard';
import TrendChart from '../components/TrendChart';
import { classifyBloodPressure, classifyGlucose, type Level } from '../lib/classify';
import { earlyWarnings } from '../lib/earlyWarning';
import { formatDateTime, formatValue, seriesFor, type Entry } from '../lib/history';

/**
 * Doctor dashboard prototype with FICTIONAL patients and simulated device data.
 * Status uses the same classification and early-warning logic as the patient app.
 */
interface DemoPatient {
  id: string;
  name: string;
  age: number;
  conditions: string;
  entries: Entry[];
}

const DAY = 864e5;

function rng(seed: number) {
  let a = seed;
  return () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

function makePatients(now: number): DemoPatient[] {
  const mk = (id: string, name: string, age: number, conditions: string, seed: number, sys0: number, sysTrend: number, glu0?: number): DemoPatient => {
    const r = rng(seed);
    const entries: Entry[] = [];
    for (let d = 13; d >= 0; d--) {
      const t = now - d * DAY - 3 * 3600e3;
      const sys = Math.round(sys0 + sysTrend * (13 - d) + (r() - 0.5) * 8);
      const dia = Math.round(sys * 0.62 + (r() - 0.5) * 6);
      const bp = classifyBloodPressure(sys, dia);
      entries.push({ id: `${id}t${d}`, type: 'tekanan', sys, dia, time: t, label: bp.label, level: bp.level });
      if (glu0) {
        const mgdl = Math.round(glu0 + (r() - 0.5) * 40);
        const g = classifyGlucose(mgdl, 'puasa');
        entries.push({ id: `${id}g${d}`, type: 'gula', mgdl, timing: 'puasa', time: t + 600e3, label: g.label, level: g.level });
      }
    }
    return { id, name, age, conditions, entries: entries.sort((a, b) => b.time - a.time) };
  };
  return [
    mk('p1', 'Bu Sri (DEMO)', 67, 'Hipertensi', 3, 128, 2.2),
    mk('p2', 'Pak Budi (DEMO)', 58, 'Diabetes, hipertensi', 7, 132, 0.2, 150),
    mk('p3', 'Bu Ani (DEMO)', 72, 'Hipertensi', 11, 122, -0.3),
    mk('p4', 'Pak Joko (DEMO)', 61, 'Diabetes', 19, 116, 0, 104),
  ];
}

function statusOf(p: DemoPatient, now: number): { level: Level; reasons: string[] } {
  const w = earlyWarnings(p.entries, now);
  const latest = p.entries.slice(0, 2);
  const worst = latest.reduce<Level>((acc, e) => (e.level === 'bahaya' ? 'bahaya' : e.level === 'perhatian' && acc === 'normal' ? 'perhatian' : acc), 'normal');
  const level: Level = w.some((x) => x.level === 'bahaya') || worst === 'bahaya' ? 'bahaya' : w.length || worst === 'perhatian' ? 'perhatian' : 'normal';
  return { level, reasons: w.length ? w.map((x) => x.title) : latest.map((e) => `${formatValue(e)} (${e.label})`) };
}

const ORDER: Record<Level, number> = { bahaya: 0, perhatian: 1, normal: 2 };

export default function DoctorDashboardPage() {
  const [now] = useState(Date.now);
  const patients = useMemo(() => makePatients(now), [now]);
  const rows = patients.map((p) => ({ p, s: statusOf(p, now) })).sort((a, b) => ORDER[a.s.level] - ORDER[b.s.level]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const open = rows.find((r) => r.p.id === openId);

  return (
    <div className="space-y-4">
      <BackHome />
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          Dashboard Dokter <DemoBadge />
        </h1>
        <p className="mt-1 text-[15px] text-slate-600 dark:text-slate-400">
          Pasien diurutkan dari yang paling perlu perhatian. AI hanya memberi tahu dokter saat ada angka berbahaya atau tren memburuk.
        </p>
      </header>
      <Notice tone="info">Pasien dan data di halaman ini fiktif, untuk demonstrasi kepada dokter mitra dan investor.</Notice>

      <ul className="space-y-2">
        {rows.map(({ p, s }) => {
          const st = LEVEL_STYLE[s.level];
          return (
            <li key={p.id}>
              <button className={`w-full rounded-2xl border p-3 text-left ${st.box}`} onClick={() => setOpenId(openId === p.id ? null : p.id)} aria-expanded={openId === p.id}>
                <div className="flex items-center gap-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${st.badge}`}>
                    <LevelIcon level={s.level} size={16} />
                  </span>
                  <span className={`min-w-0 flex-1 ${st.text}`}>
                    <span className="block font-bold">
                      {p.name}, {p.age} th
                    </span>
                    <span className="block text-sm opacity-90">{p.conditions}</span>
                    <span className="block truncate text-sm">{s.reasons[0]}</span>
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {open && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">{open.p.name}</h2>
          <ul className="list-disc pl-5 text-[15px]">
            {open.s.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <TrendChart points={seriesFor(open.p.entries, 'tekanan', 14, now)} days={30} now={now} seriesNames={['Sistolik', 'Diastolik']} unit="mmHg" refLines={[120, 80]} />
          <p className="text-xs text-slate-500">Data terakhir: {formatDateTime(open.p.entries[0].time)} (dari alat Bluetooth pasien, simulasi)</p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['Chat', IconChat],
                ['Video', IconDoctor],
                ['Kunjungi', IconHome],
              ] as const
            ).map(([label, Icon]) => (
              <button key={label} className="btn-secondary !px-2 text-sm" onClick={() => setAction(`${label} dengan ${open.p.name}: tersedia pada versi dengan server.`)}>
                <Icon width={16} height={16} /> {label}
              </button>
            ))}
          </div>
          {action && <Notice tone="warn">{action}</Notice>}
        </section>
      )}
    </div>
  );
}
