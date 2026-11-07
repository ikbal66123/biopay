import { useEffect, useState } from 'react';
import type { Assessment, Level } from '../lib/classify';
import Disclaimer from './Disclaimer';
import EmergencyCall from './EmergencyCall';
import { IconAlert, IconCheck, IconInfo } from './Icons';

export const LEVEL_STYLE: Record<Level, { box: string; badge: string; text: string; name: string }> = {
  normal: {
    box: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40',
    badge: 'bg-emerald-600 text-white',
    text: 'text-emerald-900 dark:text-emerald-100',
    name: 'Normal',
  },
  perhatian: {
    box: 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40',
    badge: 'bg-amber-400 text-amber-950',
    text: 'text-amber-950 dark:text-amber-100',
    name: 'Perlu perhatian',
  },
  bahaya: {
    box: 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40',
    badge: 'bg-red-600 text-white',
    text: 'text-red-950 dark:text-red-100',
    name: 'Segera periksa',
  },
};

export function LevelIcon({ level, size = 18 }: { level: Level; size?: number }) {
  const P = { width: size, height: size };
  if (level === 'normal') return <IconCheck {...P} />;
  if (level === 'perhatian') return <IconInfo {...P} />;
  return <IconAlert {...P} />;
}

interface Props {
  result: Assessment;
  /** Big headline value, e.g. "24,2" or "120/80". */
  value?: string;
  unit?: string;
  /** Called when the user taps "Simpan ke riwayat". */
  onSave?: () => void;
  /** Changes whenever the input changes, so the "saved" state resets. */
  saveKey?: string;
  extraNote?: string;
}

export default function ResultCard({ result, value, unit, onSave, saveKey, extraNote }: Props) {
  const s = LEVEL_STYLE[result.level];
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [saveKey]);

  return (
    <section className={`rounded-2xl border p-4 ${s.box}`} aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className={s.text}>
          {value && (
            <p className="text-4xl font-bold tabular-nums">
              {value}
              {unit && <span className="ml-1 text-base font-medium opacity-80">{unit}</span>}
            </p>
          )}
          <p className="mt-1 text-lg font-bold">{result.label}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${s.badge}`}>
          <LevelIcon level={result.level} size={14} />
          {s.name}
        </span>
      </div>
      <p className={`mt-2 text-[15px] ${s.text}`}>{result.message}</p>
      <ul className={`mt-2 list-disc space-y-1 pl-5 text-[15px] ${s.text}`}>
        {result.advice.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      {result.emergency && <EmergencyCall className="mt-3" />}
      {extraNote && <p className={`mt-3 text-sm ${s.text} opacity-90`}>{extraNote}</p>}
      {onSave && (
        <button
          className="btn-secondary mt-4 w-full"
          disabled={saved}
          onClick={() => {
            onSave();
            setSaved(true);
          }}
        >
          {saved ? (
            <>
              <IconCheck width={18} height={18} /> Tersimpan di riwayat
            </>
          ) : (
            'Simpan ke riwayat'
          )}
        </button>
      )}
      <div className="mt-3">
        <Disclaimer />
      </div>
    </section>
  );
}
