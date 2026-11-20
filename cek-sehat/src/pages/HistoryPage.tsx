import { useMemo, useState } from 'react';
import { Notice } from '../components/Bits';
import { makeBackup, parseBackup, restoreBackup, type ParsedBackup } from '../lib/backup';
import Disclaimer from '../components/Disclaimer';
import { IconDownload, IconTrash } from '../components/Icons';
import PageHeader from '../components/PageHeader';
import { LEVEL_STYLE, LevelIcon } from '../components/ResultCard';
import TrendChart, { type Band } from '../components/TrendChart';
import {
  TYPE_LABEL,
  clearEntries,
  deleteEntry,
  fmtDec,
  formatDateTime,
  formatDetail,
  formatValue,
  seriesFor,
  toCsv,
  type Entry,
  type EntryType,
} from '../lib/history';
import { useHistory } from '../lib/useHistory';

type ChartType = Exclude<EntryType, 'suhu'>;
const CHART_TYPES: ChartType[] = ['detak', 'tekanan', 'gula', 'berat'];

const CHART_INFO: Record<ChartType, { names: string[]; unit: string; note: string }> = {
  detak: { names: ['Detak jantung'], unit: 'bpm', note: 'Area hijau: 50–100 bpm, rentang normal saat istirahat.' },
  tekanan: {
    names: ['Sistolik (atas)', 'Diastolik (bawah)'],
    unit: 'mmHg',
    note: 'Garis putus-putus: batas normal 120 (atas) dan 80 (bawah).',
  },
  gula: {
    names: ['Gula darah'],
    unit: 'mg/dL',
    note: 'Area hijau: 70–140 mg/dL (sewaktu atau 2 jam setelah makan). Saat puasa, normal di bawah 100.',
  },
  berat: { names: ['Berat badan'], unit: 'kg', note: '' },
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save all data to a file, or restore it on a new phone / new app address. */
function BackupCard() {
  const [pending, setPending] = useState<Extract<ParsedBackup, { ok: true }> | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-lg font-bold">Cadangkan data</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Simpan semua riwayat dan catatan makan ke satu file. Pakai saat ganti HP atau ganti alamat aplikasi. API key tidak ikut
          tersimpan.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn-primary"
          onClick={() => {
            downloadFile(`cadangan-cek-sehat-${today()}.json`, JSON.stringify(makeBackup()), 'application/json');
            setMsg({ tone: 'ok', text: 'File cadangan tersimpan di folder Download. Simpan di tempat aman (misalnya Google Drive).' });
          }}
        >
          <IconDownload width={18} height={18} /> Simpan cadangan
        </button>
        <label className="btn-secondary cursor-pointer">
          Pulihkan
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setMsg(null);
              const p = parseBackup(await f.text().catch(() => ''));
              if (!p.ok) {
                setPending(null);
                setMsg({ tone: 'warn', text: p.error });
                return;
              }
              setPending(p);
            }}
          />
        </label>
      </div>
      {pending && (
        <div className="rounded-2xl border border-teal-300 bg-teal-50 p-3 text-[15px] dark:border-teal-800 dark:bg-teal-950/40">
          <p>
            File berisi <b>{pending.history.length}</b> hasil pengukuran dan <b>{pending.meals.length}</b> catatan makan
            {pending.exportedAt && <> (dibuat {new Date(pending.exportedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })})</>}.
            Data yang sudah ada di HP ini tidak akan terhapus.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn-secondary" onClick={() => setPending(null)}>
              Batal
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                const r = restoreBackup(pending);
                setPending(null);
                setMsg({
                  tone: 'ok',
                  text:
                    r.history + r.meals === 0
                      ? 'Semua data di file ini sudah ada di HP ini.'
                      : `Berhasil: ${r.history} hasil pengukuran dan ${r.meals} catatan makan dipulihkan.`,
                });
              }}
            >
              Pulihkan
            </button>
          </div>
        </div>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </section>
  );
}

export default function HistoryPage() {
  const entries = useHistory();
  const [type, setType] = useState<ChartType>('detak');
  const [days, setDays] = useState<7 | 30>(7);
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const points = useMemo(() => seriesFor(entries, type, days, now), [entries, type, days, now]);

  const band = useMemo<Band | undefined>(() => {
    if (type === 'detak') return { from: 50, to: 100 };
    if (type === 'gula') return { from: 70, to: 140 };
    if (type === 'berat') {
      const last = entries.find((e) => e.type === 'berat');
      if (last && last.type === 'berat') {
        const m2 = (last.heightCm / 100) ** 2;
        return { from: Math.round(18.5 * m2 * 10) / 10, to: Math.round(25 * m2 * 10) / 10 };
      }
    }
    return undefined;
  }, [type, entries]);

  const info = CHART_INFO[type];
  const note =
    type === 'berat' && band
      ? `Area hijau: ${fmtDec(band.from)}–${fmtDec(band.to)} kg, berat normal (IMT 18,5–25) untuk tinggi badan terakhir.`
      : info.note;

  const exportCsv = () => downloadFile(`riwayat-cek-sehat-${today()}.csv`, toCsv(entries), 'text/csv;charset=utf-8');

  return (
    <div className="space-y-4">
      <PageHeader title="Riwayat" subtitle="Hasil yang Anda simpan. Data hanya ada di HP ini." />

      <section className="card">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {CHART_TYPES.map((t) => (
            <button key={t} className={`chip shrink-0 ${type === t ? 'chip-on' : ''}`} aria-pressed={type === t} onClick={() => setType(t)}>
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="mt-3 inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                days === d ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {d} hari
            </button>
          ))}
        </div>
        <div className="mt-3">
          {points.length ? (
            <>
              <TrendChart points={points} days={days} now={now} seriesNames={info.names} unit={info.unit} band={band} refLines={type === 'tekanan' ? [120, 80] : []} />
              {note && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{note}</p>}
            </>
          ) : (
            <p className="py-8 text-center text-[15px] text-slate-500 dark:text-slate-400">
              Belum ada data {TYPE_LABEL[type].toLowerCase()} dalam {days} hari terakhir.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Semua hasil ({entries.length})</h2>
        </div>

        {entries.length === 0 ? (
          <p className="card text-[15px] text-slate-600 dark:text-slate-400">
            Belum ada riwayat. Tekan <b>Simpan ke riwayat</b> setelah mengukur di menu Detak Jantung atau Cek Angka.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-primary" onClick={exportCsv}>
                <IconDownload width={18} height={18} /> Ekspor CSV
              </button>
              <button className="btn-secondary text-red-700 dark:text-red-400" onClick={() => setConfirmAll(true)}>
                <IconTrash width={18} height={18} /> Hapus semua
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              File CSV bisa dibuka di Excel atau Google Sheets dan ditunjukkan ke dokter.
            </p>

            {confirmAll && (
              <div role="alertdialog" aria-labelledby="hapus-semua" className="rounded-2xl border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40">
                <p id="hapus-semua" className="font-bold text-red-900 dark:text-red-100">
                  Hapus semua {entries.length} hasil?
                </p>
                <p className="mt-1 text-sm text-red-900 dark:text-red-100">Data yang dihapus tidak bisa dikembalikan. Ekspor CSV dulu jika masih diperlukan.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="btn-secondary" onClick={() => setConfirmAll(false)}>
                    Batal
                  </button>
                  <button
                    className="btn-danger"
                    onClick={() => {
                      clearEntries();
                      setConfirmAll(false);
                    }}
                  >
                    Ya, hapus semua
                  </button>
                </div>
              </div>
            )}

            <ul className="space-y-2">
              {entries.map((e) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  confirming={confirmId === e.id}
                  onAsk={() => setConfirmId(e.id)}
                  onCancel={() => setConfirmId(null)}
                  onDelete={() => {
                    deleteEntry(e.id);
                    setConfirmId(null);
                  }}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      <BackupCard />

      <Disclaimer>Riwayat ini membantu dokter melihat pola, bukan untuk mendiagnosis sendiri.</Disclaimer>

      <a href="#riset" className="block rounded-2xl border border-dashed border-slate-300 p-4 text-[15px] dark:border-slate-700">
        <span className="font-semibold">Mode Riset: uji akurasi detak jantung</span>
        <span className="block text-sm text-slate-600 dark:text-slate-400">
          Bandingkan hasil kamera dengan oksimeter atau alat lain, untuk tim peneliti.
        </span>
      </a>
    </div>
  );
}

function EntryRow(props: { entry: Entry; confirming: boolean; onAsk: () => void; onCancel: () => void; onDelete: () => void }) {
  const { entry: e } = props;
  const s = LEVEL_STYLE[e.level];
  const detail = formatDetail(e);
  return (
    <li className="card !p-3">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${s.badge}`} title={s.name}>
          <LevelIcon level={e.level} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {TYPE_LABEL[e.type]} · {formatDateTime(e.time)}
          </p>
          <p className="text-lg font-bold tabular-nums">{formatValue(e)}</p>
          <p className="text-sm">
            {e.label}
            {detail && <span className="text-slate-500 dark:text-slate-400"> · {detail}</span>}
          </p>
        </div>
        {!props.confirming && (
          <button
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
            aria-label={`Hapus ${TYPE_LABEL[e.type]} ${formatDateTime(e.time)}`}
            onClick={props.onAsk}
          >
            <IconTrash width={20} height={20} />
          </button>
        )}
      </div>
      {props.confirming && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <span className="mr-auto text-sm font-medium">Hapus hasil ini?</span>
          <button className="btn-secondary !px-3 !py-2 text-sm" onClick={props.onCancel}>
            Batal
          </button>
          <button className="btn-danger !px-3 !py-2 text-sm" onClick={props.onDelete}>
            Hapus
          </button>
        </div>
      )}
    </li>
  );
}
