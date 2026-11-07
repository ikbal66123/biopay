import { useEffect, useRef, useState } from 'react';
import Disclaimer from '../components/Disclaimer';
import EmergencyCall from '../components/EmergencyCall';
import { IconAlert, IconCheck } from '../components/Icons';
import PageHeader from '../components/PageHeader';
import {
  DANGER_SIGNS,
  MILD_SIGNS,
  MODERATE_SIGNS,
  WHEN_TO_SEE_DOCTOR,
  triage,
  type Symptom,
} from '../lib/triage';

export default function SymptomsPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dismissedIgd, setDismissedIgd] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const result = triage(selected);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (DANGER_SIGNS.some((s) => s.id === id)) setDismissedIgd(false);
  };

  const showIgd = result.level === 'igd' && !dismissedIgd;

  useEffect(() => {
    if (!showIgd) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showIgd]);

  return (
    <div>
      <PageHeader title="Cek Gejala" subtitle="Centang keluhan yang sedang dialami. Kami bantu menentukan sebaiknya ke mana dan seberapa cepat." />

      <Group
        title="Tanda bahaya"
        desc="Jika ada satu saja, segera ke IGD."
        tone="red"
        items={DANGER_SIGNS}
        selected={selected}
        onToggle={toggle}
      />
      <Group
        title="Keluhan yang perlu diperiksa"
        tone="amber"
        items={MODERATE_SIGNS}
        selected={selected}
        onToggle={toggle}
      />
      <Group title="Keluhan ringan" tone="green" items={MILD_SIGNS} selected={selected} onToggle={toggle} />

      <div ref={resultRef} className="space-y-3">
        {result.level === 'kosong' && (
          <p className="card text-[15px] text-slate-600 dark:text-slate-400">
            Belum ada yang dicentang. Pilih keluhan di atas untuk melihat saran.
          </p>
        )}

        {result.level === 'igd' && (
          <section className="rounded-2xl border border-red-300 bg-red-50 p-4 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
            <p className="text-lg font-bold">Segera ke IGD</p>
            <Reasons reasons={result.reasons} />
            <EmergencyCall className="mt-3" />
            <button className="btn-secondary mt-2 w-full" onClick={() => setDismissedIgd(false)}>
              Tampilkan layar darurat
            </button>
          </section>
        )}

        {result.level === 'dokter24' && (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="flex items-center gap-2 text-lg font-bold">
              <IconAlert width={20} height={20} /> Periksa ke dokter dalam 24 jam
            </p>
            <p className="mt-1 text-[15px]">
              Bisa ke Puskesmas, klinik, atau konsultasi dokter secara online.
            </p>
            <Reasons reasons={result.reasons} />
            <p className="mt-3 text-[15px] font-semibold">
              Langsung ke IGD jika keluhan memburuk atau muncul tanda bahaya di atas.
            </p>
          </section>
        )}

        {result.level === 'rumah' && (
          <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
            <p className="flex items-center gap-2 text-lg font-bold">
              <IconCheck width={20} height={20} /> Bisa dirawat di rumah
            </p>
            <Reasons reasons={result.reasons} />
            <p className="mt-3 font-semibold">Tips perawatan</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[15px]">
              {result.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="mt-3 font-semibold">Periksa ke dokter jika:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[15px]">
              {WHEN_TO_SEE_DOCTOR.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        )}

        {selected.size > 0 && (
          <button className="btn-secondary w-full" onClick={() => setSelected(new Set())}>
            Hapus semua centang
          </button>
        )}
        <Disclaimer>
          Saran ini membantu menentukan ke mana dan kapan berobat, bukan diagnosis. Jika ragu, lebih baik periksa ke
          tenaga kesehatan.
        </Disclaimer>
      </div>

      {showIgd && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="igd-title"
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-red-600 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-white"
        >
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
            <IconAlert width={56} height={56} />
            <h2 id="igd-title" className="mt-4 text-4xl font-extrabold leading-tight">
              Segera ke IGD
            </h2>
            <p className="mt-3 text-lg">
              Ada tanda bahaya yang perlu ditangani secepatnya. Jangan menunggu keluhan hilang sendiri.
            </p>
            <ul className="mt-4 space-y-1 text-lg font-semibold">
              {result.reasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
            <div className="mt-6 space-y-3">
              <a href="tel:119" className="btn w-full bg-white py-4 text-xl text-red-700">
                Telepon 119 (ambulans / gawat darurat)
              </a>
              <a href="tel:112" className="btn w-full bg-white py-4 text-xl text-red-700">
                Telepon 112 (panggilan darurat)
              </a>
            </div>
            <ul className="mt-6 list-disc space-y-1 pl-5 text-[15px] text-red-50">
              <li>Minta orang terdekat menemani dan mengantar ke IGD terdekat.</li>
              <li>Jangan menyetir sendiri.</li>
              <li>Jika nyeri dada, duduk atau berbaring dan jangan banyak bergerak.</li>
            </ul>
            <div className="mt-auto pt-6">
              <button
                className="btn w-full border border-white/60 text-white"
                onClick={() => {
                  setDismissedIgd(true);
                  setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
                }}
              >
                Kembali ke daftar gejala
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Reasons({ reasons }: { reasons: string[] }) {
  return (
    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[15px]">
      {reasons.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
  );
}

const TONE = {
  red: 'text-red-700 dark:text-red-400',
  amber: 'text-amber-700 dark:text-amber-400',
  green: 'text-emerald-700 dark:text-emerald-400',
};
const CHECK = {
  red: 'accent-red-600',
  amber: 'accent-amber-500',
  green: 'accent-emerald-600',
};

function Group(props: {
  title: string;
  desc?: string;
  tone: keyof typeof TONE;
  items: Symptom[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <section className="card mb-4">
      <h2 className={`text-lg font-bold ${TONE[props.tone]}`}>{props.title}</h2>
      {props.desc && <p className="text-sm text-slate-600 dark:text-slate-400">{props.desc}</p>}
      <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
        {props.items.map((s) => (
          <li key={s.id}>
            <label className="flex cursor-pointer items-start gap-3 py-3">
              <input
                type="checkbox"
                className={`mt-0.5 h-6 w-6 shrink-0 ${CHECK[props.tone]}`}
                checked={props.selected.has(s.id)}
                onChange={() => props.onToggle(s.id)}
              />
              <span>
                <span className="block text-[15px] font-medium leading-snug">{s.label}</span>
                {s.hint && <span className="block text-sm text-slate-500 dark:text-slate-400">{s.hint}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
