import { useState } from 'react';
import { BackHome, DemoBadge, Notice } from '../components/Bits';
import { IconMap, IconPhone } from '../components/Icons';
import { loadProfile } from '../lib/profile';
import { whatsappLink } from '../lib/family';

const NUMBERS = [
  { tel: '112', label: 'Panggilan darurat', desc: 'Polisi, ambulans, pemadam kebakaran' },
  { tel: '119', label: 'Ambulans / gawat darurat medis', desc: 'Layanan PSC 119' },
  { tel: '115', label: 'Basarnas (SAR)', desc: 'Tersesat atau celaka di gunung, laut, hutan' },
];

type Loc = { lat: number; lon: number; acc: number };

export default function EmergencyPage() {
  const [loc, setLoc] = useState<Loc | null>(null);
  const [locError, setLocError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const profile = loadProfile();

  const getLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocError('Perangkat ini tidak bisa membaca lokasi.');
      return;
    }
    setBusy(true);
    setLocError('');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) });
        setBusy(false);
      },
      (e) => {
        setBusy(false);
        setLocError(
          e.code === e.PERMISSION_DENIED
            ? 'Izin lokasi ditolak. Izinkan lokasi di pengaturan browser, atau sebutkan patokan tempat Anda saat menelepon.'
            : 'Lokasi belum didapat. Pastikan GPS menyala, lalu coba lagi.',
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  const coords = loc ? `${loc.lat.toFixed(6)}, ${loc.lon.toFixed(6)}` : '';
  const mapsUrl = loc ? `https://maps.google.com/?q=${loc.lat.toFixed(6)},${loc.lon.toFixed(6)}` : '';
  const message = loc
    ? `DARURAT. Saya butuh bantuan. Lokasi saya: ${coords} (akurasi ±${loc.acc} m) ${mapsUrl}`
    : '';

  return (
    <div className="space-y-4">
      <BackHome />
      <header>
        <h1 className="text-3xl font-extrabold text-red-700 dark:text-red-400">Darurat</h1>
        <p className="mt-1 text-[15px] text-slate-700 dark:text-slate-300">
          Layanan ini <b>gratis</b> dan tidak pernah dikenai tarif. Telepon sekarang jika ada yang pingsan, sesak berat, nyeri dada,
          kejang, perdarahan hebat, kecelakaan, atau tersesat.
        </p>
      </header>

      <div className="space-y-2">
        {NUMBERS.map((n) => (
          <a key={n.tel} href={`tel:${n.tel}`} className="flex items-center gap-4 rounded-2xl bg-red-600 p-4 text-white shadow hover:bg-red-700">
            <span className="text-3xl font-extrabold tabular-nums">{n.tel}</span>
            <span>
              <span className="block font-bold">{n.label}</span>
              <span className="block text-sm text-red-50">{n.desc}</span>
            </span>
            <IconPhone width={24} height={24} className="ml-auto" />
          </a>
        ))}
      </div>

      <section className="card space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <IconMap width={20} height={20} /> Bagikan lokasi
        </h2>
        <p className="text-[15px] text-slate-600 dark:text-slate-400">
          Bacakan koordinat ini ke petugas, atau kirim ke keluarga. Bekerja juga di gunung selama GPS menyala.
        </p>
        {!loc ? (
          <button className="btn-primary w-full" onClick={getLocation} disabled={busy}>
            {busy ? 'Mencari lokasi…' : 'Ambil lokasi saya'}
          </button>
        ) : (
          <div className="space-y-2">
            <p className="rounded-xl bg-slate-100 p-3 font-mono text-lg dark:bg-slate-800">{coords}</p>
            <p className="text-sm text-slate-500">Akurasi sekitar ±{loc.acc} meter</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(message);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? 'Tersalin' : 'Salin'}
              </button>
              <a className="btn-secondary" href={mapsUrl} target="_blank" rel="noreferrer">
                Buka peta
              </a>
              <a
                className="btn-primary col-span-2"
                href={whatsappLink(profile.familyPhone, message)}
                target="_blank"
                rel="noreferrer"
              >
                Kirim lokasi lewat WhatsApp{profile.familyName ? ` ke ${profile.familyName}` : ''}
              </a>
            </div>
            <button className="text-sm font-semibold text-teal-700 underline dark:text-teal-400" onClick={getLocation}>
              Perbarui lokasi
            </button>
          </div>
        )}
        {locError && <Notice tone="warn">{locError}</Notice>}
      </section>

      <section className="card space-y-2 text-[15px]">
        <h2 className="text-lg font-bold">Sambil menunggu bantuan</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Tetap tenang, jangan tinggalkan orang yang sakit sendirian.</li>
          <li>Pingsan tetapi bernapas: baringkan miring, longgarkan pakaian.</li>
          <li>Tidak bernapas: mulai tekan dada di tengah, keras dan cepat (100–120 kali per menit) sampai petugas datang.</li>
          <li>Perdarahan: tekan lukanya dengan kain bersih terus-menerus.</li>
          <li>Kejang: jauhkan benda keras, jangan masukkan apa pun ke mulut.</li>
          <li>Di gunung: tetap di tempat, hemat baterai, buat diri terlihat, tetap hangat.</li>
        </ul>
      </section>

      <Notice tone="info">
        <span className="mr-1">
          <DemoBadge>Rencana</DemoBadge>
        </span>
        Pendampingan dokter lewat video sampai bantuan datang akan aktif setelah aplikasi bermitra dengan dokter jaga. Saat ini, ikuti arahan
        petugas 112/119.
      </Notice>
    </div>
  );
}
