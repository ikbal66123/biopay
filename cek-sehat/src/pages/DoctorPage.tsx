import { useEffect, useMemo, useState } from 'react';
import { BackHome, DemoBadge, Notice } from '../components/Bits';
import { IconChat, IconDoctor, IconHome, IconPhone } from '../components/Icons';
import { peekSummary, takeNavState } from '../lib/nav';
import { loadProfile, saveProfile } from '../lib/profile';
import { quoteVisit, rupiah, TARIFF } from '../lib/tariff';

type Tab = 'online' | 'rumah' | 'darurat';

/** Fictional doctors for the prototype. Real partner doctors must hold an active STR and SIP. */
const DEMO_DOCTORS = [
  { name: 'dr. Contoh Satu (DEMO)', spec: 'Dokter umum', shift: 'Jaga 07.00–15.00' },
  { name: 'dr. Contoh Dua (DEMO)', spec: 'Dokter umum', shift: 'Jaga 15.00–23.00' },
  { name: 'dr. Contoh Tiga, Sp.PD (DEMO)', spec: 'Spesialis penyakit dalam', shift: 'Jaga 23.00–07.00' },
];

export default function DoctorPage() {
  const nav = useMemo(takeNavState, []);
  const [tab, setTab] = useState<Tab>((nav.tab as Tab) || 'online');
  const summary = peekSummary();

  return (
    <div className="space-y-4">
      <BackHome />
      <header>
        <h1 className="text-2xl font-bold">Panggil Dokter</h1>
        <p className="mt-1 text-[15px] text-slate-600 dark:text-slate-400">Kapan saja, di mana saja. Pilih jenis layanan.</p>
      </header>

      <div className="grid grid-cols-3 gap-2" role="tablist">
        {(
          [
            ['online', 'Chat / video', IconChat],
            ['rumah', 'Ke rumah', IconHome],
            ['darurat', 'Darurat', IconPhone],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-sm font-semibold ${
              tab === id
                ? id === 'darurat'
                  ? 'border-red-600 bg-red-600 text-white'
                  : 'border-teal-700 bg-teal-700 text-white dark:border-teal-500 dark:bg-teal-600'
                : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            <Icon width={22} height={22} />
            {label}
          </button>
        ))}
      </div>

      {summary && tab !== 'darurat' && (
        <details className="card text-sm">
          <summary className="cursor-pointer font-semibold">Ringkasan AI yang akan diteruskan ke dokter</summary>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-slate-700 dark:text-slate-300">{summary}</pre>
        </details>
      )}

      {tab === 'online' && <OnlineTab />}
      {tab === 'rumah' && <HomeVisitTab />}
      {tab === 'darurat' && (
        <div className="space-y-3">
          <Notice tone="danger">
            Keadaan darurat <b>tidak dikenai biaya</b> dan tidak menunggu dokter aplikasi. Langsung hubungi layanan darurat.
          </Notice>
          <a href="#darurat" className="btn-danger w-full py-4 text-lg">
            Buka layar darurat (112 · 119 · 115)
          </a>
        </div>
      )}
    </div>
  );
}

function OnlineTab() {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <section className="space-y-3">
      <Notice tone="info">
        Dokter jaga 24 jam bergiliran, untuk seluruh Indonesia. <DemoBadge /> Dokter di bawah ini fiktif; layanan sungguhan aktif setelah
        kerja sama dengan dokter ber-STR dan SIP.
      </Notice>
      <ul className="space-y-2">
        {DEMO_DOCTORS.map((d) => (
          <li key={d.name} className="card flex items-center gap-3 !p-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100">
              <IconDoctor width={22} height={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{d.name}</span>
              <span className="block text-sm text-slate-600 dark:text-slate-400">
                {d.spec} · {d.shift}
              </span>
              <span className="block text-xs text-slate-500">STR/SIP: DEMO</span>
            </span>
            <button className="btn-primary !px-3 !py-2 text-sm" onClick={() => setPicked(d.name)}>
              Hubungi
            </button>
          </li>
        ))}
      </ul>
      {picked && (
        <Notice tone="warn">
          <b>Mode demo.</b> Pada versi sungguhan, Anda akan tersambung chat atau video dengan {picked.replace(' (DEMO)', '')} dan ringkasan AI
          ikut terkirim. Untuk sekarang, gunakan layanan telemedisin resmi atau datang ke Puskesmas.
        </Notice>
      )}
    </section>
  );
}

function HomeVisitTab() {
  const [profile, setProfile] = useState(loadProfile);
  const [km, setKm] = useState(4);
  const [holiday, setHoliday] = useState(false);
  const [difficult, setDifficult] = useState(false);
  const [freeLeft, setFreeLeft] = useState(1);
  const [booked, setBooked] = useState<{ eta: number; start: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const hour = new Date().getHours();
  const q = quoteVisit({ distanceKm: km, hour, holiday, difficult, subscriber: profile.subscriber, freeVisitsLeft: freeLeft });

  useEffect(() => {
    if (!booked) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [booked]);

  if (booked) {
    // demo: compress the trip so it can be watched (1 real second = 1 simulated minute)
    const elapsedMin = Math.floor((now - booked.start) / 1000);
    const left = Math.max(0, booked.eta - elapsedMin);
    const progress = Math.min(1, elapsedMin / booked.eta);
    const stage = progress === 0 ? 'Dokter menyiapkan alat' : left > 0 ? 'Dokter dalam perjalanan' : 'Dokter sudah tiba';
    return (
      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Pelacakan dokter</h2>
          <DemoBadge />
        </div>
        <p className="text-3xl font-extrabold tabular-nums">{left > 0 ? `${left} menit lagi` : 'Sudah tiba'}</p>
        <p className="text-[15px] text-slate-600 dark:text-slate-400">{stage}</p>
        <div className="relative h-3 rounded-full bg-slate-200 dark:bg-slate-800">
          <div className="absolute inset-y-0 left-0 rounded-full bg-teal-600 transition-all" style={{ width: `${progress * 100}%` }} />
          <span className="absolute -top-2 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full bg-teal-700 text-white shadow" style={{ left: `${progress * 100}%` }}>
            <IconDoctor width={14} height={14} />
          </span>
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>Klinik</span>
          <span>Rumah Anda</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Simulasi: 1 detik = 1 menit. Versi sungguhan memakai GPS dokter.</p>
        <button className="btn-secondary w-full" onClick={() => setBooked(null)}>
          Batalkan
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <Notice tone="info">
        Tersedia di wilayah yang sudah dilayani (radius {TARIFF.maxKm} km dari klinik mitra). <DemoBadge>Contoh tarif</DemoBadge>
      </Notice>
      <div className="card space-y-3">
        <div>
          <label htmlFor="jarak" className="label">
            Jarak dari klinik: <b className="tabular-nums">{km} km</b>
          </label>
          <input id="jarak" type="range" min={1} max={35} value={km} onChange={(e) => setKm(Number(e.target.value))} className="w-full accent-teal-700" />
          <p className="text-xs text-slate-500">Versi sungguhan menghitung jarak dari lokasi GPS Anda.</p>
        </div>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="h-5 w-5 shrink-0 accent-teal-700" checked={holiday} onChange={(e) => setHoliday(e.target.checked)} />
          Hari libur
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="h-5 w-5 shrink-0 accent-teal-700" checked={difficult} onChange={(e) => setDifficult(e.target.checked)} />
          Lokasi sulit dijangkau (tanpa akses mobil, tangga, pulau)
        </label>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 accent-teal-700"
            checked={!!profile.subscriber}
            onChange={(e) => {
              const p = { ...profile, subscriber: e.target.checked };
              setProfile(p);
              saveProfile(p);
            }}
          />
          Saya pelanggan dokter langganan <DemoBadge />
        </label>
        {profile.subscriber && (
          <label className="flex items-center gap-3 pl-8 text-sm">
            Sisa kunjungan gratis bulan ini:
            <select className="rounded-lg border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700" value={freeLeft} onChange={(e) => setFreeLeft(Number(e.target.value))}>
              {[0, 1, 2].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {q.kind === 'luar-jangkauan' && (
        <Notice tone="warn">
          Lokasi di luar jangkauan kunjungan (lebih dari {q.maxKm} km). Gunakan chat/video dokter, atau ke Puskesmas terdekat.
        </Notice>
      )}
      {q.kind === 'tarif' && (
        <div className="card space-y-2">
          <table className="w-full text-[15px]">
            <tbody>
              {q.lines.map((l) => (
                <tr key={l.label}>
                  <td className="py-1 pr-2">{l.label}</td>
                  <td className={`py-1 text-right tabular-nums ${l.amount < 0 ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{rupiah(l.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-bold dark:border-slate-800">
                <td className="pt-2">Total</td>
                <td className="pt-2 text-right text-lg tabular-nums">{rupiah(q.total)}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-sm text-slate-600 dark:text-slate-400">Perkiraan tiba: sekitar {q.etaMinutes} menit</p>
          <button className="btn-primary w-full" onClick={() => setBooked({ eta: q.etaMinutes, start: Date.now() })}>
            Pesan kunjungan <DemoBadge />
          </button>
        </div>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Tidak ada lonjakan harga untuk keadaan darurat. Darurat selalu gratis lewat 112 / 119 / 115.
      </p>
    </section>
  );
}
