export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; children: React.ReactNode }) {
  const cls = {
    info: 'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100',
    warn: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100',
    danger: 'border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100',
    ok: 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
  }[tone];
  return <div className={`rounded-2xl border p-3 text-[15px] ${cls}`}>{children}</div>;
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-4 text-[15px] text-slate-600 dark:text-slate-300" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      {label}
    </div>
  );
}

/** Shown once, before the first photo is sent to the AI service. */
export function AiConsent({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="card space-y-3 text-[15px]">
      <p className="text-lg font-bold">Sebelum memakai AI</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Fitur ini butuh internet.</li>
        <li>
          Foto makanan dan kondisi yang Anda pilih akan <b>dikirim ke layanan AI (Claude dari Anthropic)</b> untuk dianalisis. Data
          kesehatan lain tetap di HP ini.
        </li>
        <li>Hasilnya perkiraan. Untuk diet khusus, ikuti anjuran dokter atau ahli gizi.</li>
      </ul>
      <button className="btn-primary w-full" onClick={onAccept}>
        Saya setuju, lanjutkan
      </button>
    </div>
  );
}
