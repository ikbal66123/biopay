import { useCallback, useEffect, useRef, useState } from 'react';
import Disclaimer from '../components/Disclaimer';
import { IconAlert, IconInfo } from '../components/Icons';
import PageHeader from '../components/PageHeader';
import ResultCard from '../components/ResultCard';
import { CameraError, openRearCamera, stopCamera } from '../lib/camera';
import { classifyPulse } from '../lib/classify';
import { addEntry } from '../lib/history';
import { takeNavState } from '../lib/nav';
import { analyzePpg, frameStats, isFingerCovering, type PpgResult, type Sample } from '../lib/ppg';

const MEASURE_MS = 30_000;
/** finger must be steady this long before the countdown starts */
const SETTLE_MS = 1_000;
/** finger off the lens this long restarts the countdown */
const LOST_MS = 1_000;
const SAMPLE_GAP_MS = 28; // ~30 fps cap
const WAVE_SECONDS = 5;

type Phase = 'intro' | 'starting' | 'measuring' | 'result' | 'error';

interface Live {
  finger: boolean;
  secondsLeft: number;
  restarted: boolean;
  /** measuring has begun (finger was steady) */
  running: boolean;
}

interface Props {
  /** Research mode: receives the raw signal and analysis after every measurement. */
  onMeasured?: (samples: Sample[], result: PpgResult) => void;
  /** Hide the page title and the "save to history" button. */
  embedded?: boolean;
}

export default function HeartRatePage({ onMeasured, embedded = false }: Props = {}) {
  const onMeasuredRef = useRef(onMeasured);
  onMeasuredRef.current = onMeasured;
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState('');
  const [torch, setTorch] = useState(true);
  const [live, setLive] = useState<Live>({ finger: false, secondsLeft: 30, restarted: false, running: false });
  const [result, setResult] = useState<PpgResult | null>(null);
  const [stoppedNote, setStoppedNote] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<{ cancel: () => void } | null>(null);
  const runId = useRef(0);

  const stop = useCallback(() => {
    runId.current++;
    loopRef.current?.cancel();
    loopRef.current = null;
    stopCamera(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Camera and flash must go off when the user leaves the page or the app.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && streamRef.current) {
        stop();
        setStoppedNote('Pengukuran dihentikan karena aplikasi ditinggalkan. Silakan mulai lagi.');
        setPhase('intro');
      }
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', stop);
      stop();
    };
  }, [stop]);

  const start = async () => {
    stop();
    const id = runId.current;
    setStoppedNote('');
    setResult(null);
    setError('');
    setLive({ finger: false, secondsLeft: 30, restarted: false, running: false });
    setPhase('starting');
    try {
      const cam = await openRearCamera();
      if (id !== runId.current) {
        stopCamera(cam.stream);
        return;
      }
      streamRef.current = cam.stream;
      setTorch(cam.torch);
      setPhase('measuring');
    } catch (e) {
      if (id !== runId.current) return;
      setError(e instanceof CameraError ? e.message : 'Kamera tidak bisa dibuka.');
      setPhase('error');
    }
  };

  // Voice assistant: "cek detak jantung" opens this screen and starts right away.
  useEffect(() => {
    if (!embedded && takeNavState().autostart) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Frame loop, runs while measuring.
  useEffect(() => {
    if (phase !== 'measuring') return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    const id = runId.current;

    video.srcObject = stream;
    void video.play().catch(() => {});

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    let samples: Sample[] = [];
    let preview: Sample[] = [];
    let startAt: number | null = null;
    let coveredSince: number | null = null;
    let lostSince: number | null = null;
    let restarted = false;
    let last = 0;
    let lastUi = 0;
    let cancelled = false;

    const finish = () => {
      const res = analyzePpg(samples);
      stop();
      onMeasuredRef.current?.(samples, res);
      setResult(res);
      setPhase('result');
    };

    const onFrame = () => {
      if (cancelled || id !== runId.current) return;
      const now = performance.now();
      if (now - last >= SAMPLE_GAP_MS && video.readyState >= 2 && video.videoWidth) {
        last = now;
        // centre 50% of the image: the part under the fingertip
        const w = video.videoWidth;
        const h = video.videoHeight;
        ctx.drawImage(video, w * 0.25, h * 0.25, w * 0.5, h * 0.5, 0, 0, 32, 32);
        const st = frameStats(ctx.getImageData(0, 0, 32, 32).data);
        const covered = isFingerCovering(st);

        if (covered) {
          lostSince = null;
          coveredSince ??= now;
          if (startAt === null && now - coveredSince >= SETTLE_MS) {
            startAt = now;
            samples = [];
          }
        } else {
          coveredSince = null;
          lostSince ??= now;
          if (startAt !== null && now - lostSince >= LOST_MS) {
            startAt = null;
            samples = [];
            restarted = true;
          }
        }

        if (startAt !== null) {
          samples.push({ t: now, r: st.r, g: st.g });
          if (now - startAt >= MEASURE_MS) {
            finish();
            return;
          }
        }
        preview.push({ t: now, r: st.r });
        if (preview.length > 300) preview = preview.slice(-200);
        drawWave(waveRef.current, covered || startAt !== null ? preview : []);

        if (now - lastUi > 200) {
          lastUi = now;
          const elapsed = startAt === null ? 0 : now - startAt;
          setLive({
            finger: covered,
            running: startAt !== null,
            secondsLeft: Math.max(0, Math.ceil((MEASURE_MS - elapsed) / 1000)),
            restarted,
          });
        }
      }
      schedule();
    };

    const v = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
      cancelVideoFrameCallback?: (h: number) => void;
    };
    let handle = 0;
    const useVfc = typeof v.requestVideoFrameCallback === 'function';
    const schedule = () => {
      handle = useVfc ? v.requestVideoFrameCallback!(onFrame) : requestAnimationFrame(onFrame);
    };
    schedule();

    loopRef.current = {
      cancel: () => {
        cancelled = true;
        if (useVfc) v.cancelVideoFrameCallback?.(handle);
        else cancelAnimationFrame(handle);
      },
    };
    return () => loopRef.current?.cancel();
  }, [phase, stop]);

  const cancel = () => {
    stop();
    setPhase('intro');
  };

  const assessment = result?.ok && result.bpm !== null ? classifyPulse(result.bpm) : null;

  return (
    <div>
      {!embedded && (
        <PageHeader title="Detak Jantung" subtitle="Perkirakan detak jantung dengan kamera dan lampu flash HP." />
      )}

      {phase === 'intro' && (
        <div className="space-y-4">
          {stoppedNote && <Notice>{stoppedNote}</Notice>}
          <Instructions />
          <button className="btn-primary w-full py-4 text-lg" onClick={start}>
            Mulai ukur
          </button>
          <Disclaimer>
            Hasil pengukuran kamera adalah perkiraan dan tidak seakurat alat medis. Aplikasi ini alat bantu, bukan
            pengganti pemeriksaan dokter.
          </Disclaimer>
        </div>
      )}

      {phase === 'starting' && (
        <div className="card py-10 text-center text-slate-600 dark:text-slate-300">
          Membuka kamera… Jika muncul pertanyaan izin, pilih <b>Izinkan</b>.
        </div>
      )}

      {/* The video must stay in the DOM while measuring (iOS stops frames for hidden videos). */}
      <div className={phase === 'measuring' ? 'space-y-4' : 'hidden'}>
        {!torch && (
          <Notice>
            Flash tidak bisa dinyalakan otomatis di perangkat ini. Ukur di tempat yang terang, misalnya di bawah lampu
            atau dekat jendela, dan tutup kamera belakang dengan ujung jari.
          </Notice>
        )}
        <div className="card flex flex-col items-center gap-4 py-6">
          <div className="relative grid h-40 w-40 place-items-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
              <circle cx="50" cy="50" r="46" className="fill-none stroke-slate-200 dark:stroke-slate-800" strokeWidth="6" />
              <circle
                cx="50"
                cy="50"
                r="46"
                className="fill-none stroke-red-500 transition-[stroke-dashoffset] duration-200"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={289}
                strokeDashoffset={live.running ? (289 * live.secondsLeft) / 30 : 289}
              />
            </svg>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-28 w-28 rounded-full bg-slate-900 object-cover"
              aria-hidden
            />
            {live.running && (
              <span className="absolute text-4xl font-bold tabular-nums text-white drop-shadow">{live.secondsLeft}</span>
            )}
          </div>

          <p
            className={`text-center text-lg font-semibold ${
              live.finger ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}
            aria-live="polite"
          >
            {!live.finger
              ? 'Tempelkan jari menutupi kamera'
              : live.running
                ? 'Tahan… jangan bergerak'
                : 'Jari terdeteksi, bersiap…'}
          </p>
          {live.restarted && !live.running && (
            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              Jari sempat terlepas, jadi pengukuran diulang dari awal.
            </p>
          )}

          <canvas
            ref={waveRef}
            className="h-24 w-full rounded-xl bg-slate-50 dark:bg-slate-950"
            aria-label="Grafik gelombang denyut"
          />
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            Tekan dengan lembut dan tetap diam. Jangan bicara selama pengukuran.
          </p>
        </div>
        <button className="btn-secondary w-full" onClick={cancel}>
          Batal
        </button>
      </div>

      {phase === 'error' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="flex items-center gap-2 font-bold">
              <IconAlert width={20} height={20} /> Kamera tidak bisa dipakai
            </p>
            <p className="mt-1 text-[15px]">{error}</p>
          </div>
          <button className="btn-primary w-full" onClick={start}>
            Coba lagi
          </button>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Anda juga bisa memasukkan angka nadi dari alat lain di menu <b>Cek Angka → Nadi</b>.
          </p>
        </div>
      )}

      {phase === 'result' && result && (
        <div className="space-y-4">
          {assessment && result.bpm !== null ? (
            <ResultCard
              result={assessment}
              value={String(result.bpm)}
              unit="bpm"
              saveKey={String(result.bpm)}
              onSave={embedded ? undefined : () => addEntry({ type: 'detak', bpm: result.bpm!, source: 'kamera' }, assessment.label, assessment.level)}
              extraNote={`Hasil ini perkiraan dari kamera HP dan tidak seakurat alat medis seperti oksimeter atau EKG. Kualitas sinyal: ${
                result.quality >= 0.8 ? 'baik' : 'cukup'
              }. Angka di atas berlaku untuk kondisi istirahat.`}
            />
          ) : (
            <div className="rounded-2xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-lg font-bold">Pengukuran belum berhasil</p>
              <p className="mt-1 text-[15px] text-slate-700 dark:text-slate-300">
                {result.reason} Supaya hasilnya tidak menyesatkan, angka tidak ditampilkan.
              </p>
              <p className="mt-3 font-semibold">Tips agar berhasil:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[15px] text-slate-700 dark:text-slate-300">
                <li>Letakkan HP di meja atau pegang dengan kedua tangan.</li>
                <li>Tutup kamera dan flash sekaligus dengan ujung jari, tekan dengan lembut (jangan terlalu kuat).</li>
                <li>Jangan bergerak atau bicara selama 30 detik.</li>
                <li>Jika tangan dingin, gosok-gosokkan dulu agar hangat.</li>
              </ul>
            </div>
          )}
          <button className="btn-primary w-full" onClick={start}>
            {assessment ? 'Ukur lagi' : 'Ulangi pengukuran'}
          </button>
        </div>
      )}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-2xl border border-sky-300 bg-sky-50 p-3 text-[15px] text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
      <IconInfo width={20} height={20} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Instructions() {
  const steps = [
    'Duduk tenang selama 5 menit sebelum mengukur.',
    'Tekan Mulai ukur dan izinkan akses kamera.',
    'Tutup kamera belakang dan lampu flash dengan ujung jari telunjuk. Tekan dengan lembut.',
    'Tahan diam selama 30 detik sampai hitungan selesai.',
  ];
  return (
    <div className="card">
      <div className="flex items-center gap-4">
        <PhoneIllustration />
        <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
          Ujung jari akan tampak merah karena cahaya flash. Perubahan warna kecil di setiap denyut dipakai untuk
          memperkirakan detak jantung.
        </p>
      </div>
      <ol className="mt-4 space-y-2">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3 text-[15px]">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-teal-100 text-sm font-bold text-teal-800 dark:bg-teal-900 dark:text-teal-100">
              {i + 1}
            </span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PhoneIllustration() {
  return (
    <svg viewBox="0 0 80 110" className="h-28 w-20 shrink-0" aria-hidden>
      <rect x="8" y="4" width="56" height="100" rx="10" className="fill-slate-200 stroke-slate-400 dark:fill-slate-800 dark:stroke-slate-600" strokeWidth="2" />
      <circle cx="24" cy="20" r="7" className="fill-slate-700" />
      <circle cx="40" cy="20" r="4" className="fill-amber-300" />
      {/* finger */}
      <path d="M6 64 C 6 38, 14 14, 26 12 C 38 10, 40 22, 38 34 L 34 64 Z" className="fill-orange-300/90 stroke-orange-500" strokeWidth="1.5" />
      <ellipse cx="27" cy="20" rx="9" ry="7" className="fill-red-400/60" />
    </svg>
  );
}

/** Live pulse wave: last few seconds, slow drift removed, scaled to fit. */
function drawWave(canvas: HTMLCanvasElement | null, samples: Sample[]) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (samples.length < 10) return;

  const lastT = samples[samples.length - 1].t;
  const from = lastT - WAVE_SECONDS * 1000;
  let i0 = samples.length - 1;
  while (i0 > 0 && samples[i0 - 1].t >= from - 1000) i0--;
  const vals = samples.slice(i0);
  // subtract a ~0.7 s moving average, invert so beats point up
  const k = 10;
  const pts: { t: number; v: number }[] = [];
  for (let i = 0; i < vals.length; i++) {
    let s = 0,
      n = 0;
    for (let j = Math.max(0, i - k); j <= Math.min(vals.length - 1, i + k); j++) {
      s += vals[j].r;
      n++;
    }
    if (vals[i].t >= from) pts.push({ t: vals[i].t, v: s / n - vals[i].r });
  }
  if (pts.length < 2) return;
  let min = Infinity,
    max = -Infinity;
  for (const p of pts) {
    min = Math.min(min, p.v);
    max = Math.max(max, p.v);
  }
  const range = Math.max(max - min, 0.3);
  const mid = (max + min) / 2;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ef4444';
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = ((p.t - from) / (WAVE_SECONDS * 1000)) * w;
    const y = h / 2 - ((p.v - mid) / range) * (h * 0.8);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.stroke();
}
