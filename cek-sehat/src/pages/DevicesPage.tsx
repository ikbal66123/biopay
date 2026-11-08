import { useEffect, useRef, useState } from 'react';
import { BackHome, Notice } from '../components/Bits';
import { IconBluetooth, IconCheck } from '../components/Icons';
import { bluetoothSupported, connectDevice, PROFILES, type Connection, type DeviceProfile, type Reading } from '../lib/ble';
import { calcBmi, classifyBloodPressure, classifyBmi, classifyGlucose, classifyPulse, classifyTemperature } from '../lib/classify';
import { addEntry } from '../lib/history';
import { readPref } from '../lib/prefs';

function describe(r: Reading): string {
  switch (r.kind) {
    case 'tekanan':
      return `${r.sys}/${r.dia} mmHg${r.pulse ? ` · nadi ${r.pulse}` : ''}`;
    case 'suhu':
      return `${String(r.celsius).replace('.', ',')} °C`;
    case 'gula':
      return `${r.mgdl} mg/dL`;
    case 'oksimeter':
      return `SpO₂ ${r.spo2}% · nadi ${r.pulse}`;
    case 'berat':
      return `${String(r.kg).replace('.', ',')} kg`;
    case 'detak':
      return `${r.bpm} bpm`;
  }
}

/** Oxygen saturation, resting adult. */
function spo2Note(v: number) {
  if (v >= 95) return 'Saturasi oksigen normal.';
  if (v >= 92) return 'Saturasi oksigen agak rendah. Ukur ulang dalam keadaan tenang; jika tetap, periksa ke dokter.';
  return 'Saturasi oksigen rendah. Jika disertai sesak, segera ke IGD.';
}

/** Save a reading to the history, classified like a manual entry. Returns what was saved. */
function save(r: Reading): string {
  switch (r.kind) {
    case 'tekanan': {
      const a = classifyBloodPressure(r.sys, r.dia);
      addEntry({ type: 'tekanan', sys: r.sys, dia: r.dia }, a.label, a.level);
      if (r.pulse) {
        const p = classifyPulse(r.pulse);
        addEntry({ type: 'detak', bpm: r.pulse, source: 'alat' }, p.label, p.level);
      }
      return a.label;
    }
    case 'suhu': {
      const a = classifyTemperature(r.celsius);
      addEntry({ type: 'suhu', celsius: r.celsius }, a.label, a.level);
      return a.label;
    }
    case 'gula': {
      const a = classifyGlucose(r.mgdl, 'sewaktu');
      addEntry({ type: 'gula', mgdl: r.mgdl, timing: 'sewaktu' }, a.label, a.level);
      return `${a.label} (dianggap gula sewaktu)`;
    }
    case 'oksimeter':
    case 'detak': {
      const bpm = r.kind === 'detak' ? r.bpm : r.pulse;
      const a = classifyPulse(bpm);
      addEntry({ type: 'detak', bpm, source: 'alat' }, a.label, a.level);
      return a.label;
    }
    case 'berat': {
      const h = Number((readPref('height') ?? '').replace(',', '.'));
      if (h >= 50 && h <= 250) {
        const bmi = calcBmi(r.kg, h);
        const a = classifyBmi(bmi);
        addEntry({ type: 'berat', weightKg: r.kg, heightCm: h, bmi }, a.label, a.level);
        return `${a.label} (IMT ${String(bmi).replace('.', ',')})`;
      }
      return 'Isi tinggi badan di Cek Angka → Berat & IMT agar bisa disimpan.';
    }
  }
}

export default function DevicesPage() {
  const supported = bluetoothSupported();
  const [active, setActive] = useState<{ profile: DeviceProfile; conn: Connection } | null>(null);
  const [error, setError] = useState('');
  const [readings, setReadings] = useState<{ r: Reading; note: string; time: number }[]>([]);
  const connRef = useRef<Connection | null>(null);

  useEffect(() => () => connRef.current?.disconnect(), []);

  const connect = async (p: DeviceProfile) => {
    setError('');
    connRef.current?.disconnect();
    try {
      const conn = await connectDevice(
        p,
        (r) => {
          const saved = r.kind === 'berat' && !readPref('height') ? 'Isi tinggi badan di Cek Angka dulu.' : save(r);
          const note = r.kind === 'oksimeter' ? `${spo2Note(r.spo2)} ${saved}` : saved;
          setReadings((prev) => [{ r, note, time: Date.now() }, ...prev].slice(0, 20));
        },
        () => setActive(null),
      );
      connRef.current = conn;
      setActive({ profile: p, conn });
    } catch (e) {
      const name = (e as Error).name;
      if (name === 'NotFoundError') return; // user closed the chooser
      setError(name === 'SecurityError' ? 'Bluetooth hanya bisa dipakai lewat https://.' : (e as Error).message || 'Gagal menyambung.');
    }
  };

  return (
    <div className="space-y-4">
      <BackHome />
      <header>
        <h1 className="text-2xl font-bold">Alat Ukur Bluetooth</h1>
        <p className="mt-1 text-[15px] text-slate-600 dark:text-slate-400">
          Sambungkan tensimeter, alat gula darah, termometer, oksimeter, atau timbangan. Hasil langsung tersimpan di Riwayat.
        </p>
      </header>

      {!supported && (
        <Notice tone="warn">
          Browser ini belum mendukung Bluetooth. Gunakan <b>Chrome di Android</b> atau komputer. iPhone (Safari) belum mendukung; di sana
          masukkan angka lewat Cek Angka.
        </Notice>
      )}

      {active && (
        <Notice tone="ok">
          Tersambung ke <b>{active.conn.deviceName}</b>. Lakukan pengukuran di alat; hasilnya muncul di bawah.
          <button
            className="mt-2 block text-sm font-semibold underline"
            onClick={() => {
              active.conn.disconnect();
              setActive(null);
            }}
          >
            Putuskan
          </button>
        </Notice>
      )}
      {error && <Notice tone="warn">{error}</Notice>}

      {readings.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-bold">Hasil dari alat</h2>
          <ul className="space-y-2">
            {readings.map((x) => (
              <li key={x.time} className="flex items-start gap-2 text-[15px]">
                <IconCheck width={18} height={18} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>
                  <b className="tabular-nums">{describe(x.r)}</b>
                  <span className="block text-sm text-slate-600 dark:text-slate-400">{x.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="space-y-2">
        {PROFILES.map((p) => (
          <li key={p.id} className="card flex items-center gap-3 !p-3">
            <IconBluetooth width={22} height={22} className="text-sky-600" />
            <span className="flex-1 font-semibold">{p.label}</span>
            <button className="btn-primary !px-3 !py-2 text-sm" disabled={!supported} onClick={() => connect(p)}>
              {active?.profile.id === p.id ? 'Tersambung' : 'Sambungkan'}
            </button>
          </li>
        ))}
      </ul>

      <Notice tone="info">
        Alat harus mendukung <b>standar Bluetooth kesehatan</b> (Blood Pressure, Glucose, Health Thermometer, Pulse Oximeter, Weight
        Scale, Heart Rate). Banyak merek mendukungnya; alat yang hanya bisa dengan aplikasi mereknya sendiri belum bisa. Smartwatch lewat
        Apple Health / Health Connect butuh versi aplikasi Android/iPhone (tahap berikutnya).
      </Notice>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Pemantauan dokter dari jauh secara langsung (real-time) butuh server dan dokter mitra; saat ini data tersimpan di HP Anda dan bisa
        dibagikan lewat Mode Keluarga atau ekspor CSV.
      </p>
    </div>
  );
}
