import { IconInfo } from './Icons';

/** Short reminder shown under every result. */
export default function Disclaimer({ children }: { children?: React.ReactNode }) {
  return (
    <p className="flex gap-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
      <IconInfo width={16} height={16} className="mt-0.5 shrink-0" />
      <span>
        {children ??
          'Aplikasi ini alat bantu, bukan pengganti pemeriksaan dokter. Jika ragu atau keluhan berat, periksakan diri ke tenaga kesehatan.'}
      </span>
    </p>
  );
}
