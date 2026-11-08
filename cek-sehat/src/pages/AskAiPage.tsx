import { useEffect, useMemo, useRef, useState } from 'react';
import { AiConsent, BackHome, Notice, Spinner } from '../components/Bits';
import Disclaimer from '../components/Disclaimer';
import EmergencyCall from '../components/EmergencyCall';
import { IconCamera, IconChat, IconDoctor, IconHome, IconX } from '../components/Icons';
import { askAi, buildContext, hasAiConsent, resizeImage, setAiConsent } from '../lib/ai/client';
import type { KeluhanResult } from '../lib/ai/schemas';
import { isEmergency } from '../lib/intent';
import { loadMeds } from '../lib/meds';
import { goTo, saveSummary, takeNavState } from '../lib/nav';
import { loadProfile } from '../lib/profile';
import { DANGER_SIGNS, MILD_SIGNS, MODERATE_SIGNS } from '../lib/triage';
import { useHistory } from '../lib/useHistory';

const TINGKAT_STYLE: Record<string, string> = {
  'Kemungkinan besar': 'bg-teal-700 text-white',
  Mungkin: 'bg-teal-100 text-teal-900 dark:bg-teal-900 dark:text-teal-100',
  'Kemungkinan kecil': 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const SERVICE_STYLE: Record<KeluhanResult['saran_layanan'], string> = {
  'rawat di rumah': 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
  'dokter dalam 24 jam': 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100',
  'segera ke IGD': 'border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100',
};

function summaryText(r: KeluhanResult, keluhan: string): string {
  return [
    `Keluhan: ${keluhan}`,
    `Ringkasan AI: ${r.ringkasan}`,
    `Kemungkinan: ${r.kemungkinan.map((k) => `${k.kondisi} (${k.tingkat.toLowerCase()})`).join('; ')}`,
    `Saran: ${r.saran_layanan}`,
  ].join('\n');
}

export default function AskAiPage() {
  const entries = useHistory();
  const profile = useMemo(loadProfile, []);
  const [consent, setConsent] = useState(hasAiConsent);
  const [text, setText] = useState(() => takeNavState().prefill ?? '');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<KeluhanResult | null>(null);
  const [chat, setChat] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const allSigns = [...DANGER_SIGNS, ...MODERATE_SIGNS, ...MILD_SIGNS];
  const dangerIds = new Set(DANGER_SIGNS.map((s) => s.id));

  const submit = async () => {
    setError('');
    const signs = allSigns.filter((s) => checked.has(s.id)).map((s) => s.label);
    // Danger first, on the device: no waiting for the AI.
    if (isEmergency(text) || [...checked].some((id) => dangerIds.has(id))) {
      goTo('darurat');
      return;
    }
    if (!text.trim() && !signs.length) {
      setError('Tulis keluhan Anda dulu, atau centang gejalanya.');
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setResult(null);
    setChat([]);
    setChatOpen(false);
    try {
      const konteks = { ...buildContext(profile, entries, loadMeds()), gejala_dicentang: signs };
      const r = await askAi<KeluhanResult>(
        { task: 'keluhan', keluhan: text.trim() || signs.join(', '), konteks, ...(photo ? { foto: photo } : {}) },
        ac.signal,
      );
      setResult(r);
      saveSummary(summaryText(r, text.trim() || signs.join(', ')));
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || !result) return;
    if (isEmergency(msg)) {
      goTo('darurat');
      return;
    }
    const next = [...chat, { role: 'user' as const, text: msg }];
    setChat(next);
    setChatInput('');
    setBusy(true);
    setError('');
    try {
      const r = await askAi<{ balasan: string }>({
        task: 'chat',
        konteks: buildContext(profile, entries, loadMeds()),
        ringkasan: summaryText(result, text),
        pesan: next,
      });
      setChat([...next, { role: 'assistant', text: r.balasan }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!consent)
    return (
      <div className="space-y-4">
        <BackHome />
        <h1 className="text-2xl font-bold">Tanya AI: cek keluhan</h1>
        <AiConsent
          onAccept={() => {
            setAiConsent(true);
            setConsent(true);
          }}
        />
      </div>
    );

  return (
    <div className="space-y-4">
      <BackHome />
      <header>
        <h1 className="text-2xl font-bold">Tanya AI: cek keluhan</h1>
        <p className="mt-1 text-[15px] text-slate-600 dark:text-slate-400">
          Ceritakan keluhan Anda. AI memberi kemungkinan penyebab (tanpa angka persen), penanganan awal, dan kapan harus ke dokter.
        </p>
      </header>

      <section className="card space-y-3">
        <label htmlFor="keluhan" className="label">
          Keluhan Anda
        </label>
        <textarea
          id="keluhan"
          className="input min-h-[110px] !text-base"
          placeholder="Contoh: pusing dan badan panas sejak 2 hari, mual, belum bisa makan."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <details className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
          <summary className="cursor-pointer text-[15px] font-semibold">Centang gejala (opsional)</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {allSigns.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={checked.has(s.id)}
                className={`chip text-left !text-xs ${checked.has(s.id) ? 'chip-on' : ''}`}
                onClick={() =>
                  setChecked((prev) => {
                    const n = new Set(prev);
                    if (n.has(s.id)) n.delete(s.id);
                    else n.add(s.id);
                    return n;
                  })
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </details>

        <div>
          <p className="label">Foto bagian tubuh (opsional)</p>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Misalnya ruam, bintik merah, luka, mata kuning, kuku pucat. Foto hanya data tambahan.</p>
          {photo ? (
            <div className="relative inline-block">
              <img src={photo} alt="Foto keluhan" className="h-28 rounded-xl object-cover" />
              <button className="absolute -right-2 -top-2 rounded-full bg-slate-800 p-1 text-white" aria-label="Hapus foto" onClick={() => setPhoto(null)}>
                <IconX width={14} height={14} />
              </button>
            </div>
          ) : (
            <label className="btn-secondary cursor-pointer">
              <IconCamera width={18} height={18} /> Ambil foto
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setPhoto(await resizeImage(f).catch(() => null));
                }}
              />
            </label>
          )}
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Ikut terkirim: usia, jenis kelamin, penyakit dan obat dari Profil, serta hasil pengukuran 7 hari terakhir.
        </p>
        <button className="btn-primary w-full text-lg" onClick={submit} disabled={busy}>
          Periksa keluhan
        </button>
      </section>

      {busy && !result && <Spinner label="AI sedang membaca keluhan Anda…" />}
      {error && <Notice tone="warn">{error}</Notice>}

      {result && (
        <div ref={resultRef} className="space-y-3">
          <div className={`rounded-2xl border p-4 ${SERVICE_STYLE[result.saran_layanan]}`}>
            <p className="text-xs font-bold uppercase tracking-wide opacity-80">Saran</p>
            <p className="text-xl font-bold">
              {result.saran_layanan === 'rawat di rumah'
                ? 'Bisa dirawat di rumah dulu'
                : result.saran_layanan === 'dokter dalam 24 jam'
                  ? 'Periksa ke dokter dalam 24 jam'
                  : 'Segera ke IGD'}
            </p>
            {result.darurat && (
              <>
                <p className="mt-1 text-[15px]">{result.alasan_darurat}</p>
                <EmergencyCall className="mt-3" />
              </>
            )}
            <p className="mt-2 text-[15px]">{result.ringkasan}</p>
          </div>

          <section className="card space-y-2">
            <h2 className="text-lg font-bold">Kemungkinan penyebab</h2>
            <ul className="space-y-2">
              {result.kemungkinan.map((k) => (
                <li key={k.kondisi} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{k.kondisi}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TINGKAT_STYLE[k.tingkat]}`}>{k.tingkat}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{k.alasan}</p>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 dark:text-slate-400">Ini kemungkinan, bukan diagnosis. Hanya dokter yang bisa memastikan.</p>
          </section>

          <section className="card space-y-2 text-[15px]">
            <h2 className="text-lg font-bold">Penanganan awal di rumah</h2>
            <ul className="list-disc space-y-1 pl-5">
              {result.penanganan_awal.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            {result.catatan_obat && <Notice tone="warn">{result.catatan_obat}</Notice>}
            <h2 className="pt-2 text-lg font-bold">Periksa ke dokter jika</h2>
            <ul className="list-disc space-y-1 pl-5">
              {result.ke_dokter_jika.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            {result.pertanyaan_lanjutan.length > 0 && (
              <>
                <h2 className="pt-2 text-lg font-bold">AI ingin tahu</h2>
                <ul className="space-y-1">
                  {result.pertanyaan_lanjutan.map((q) => (
                    <li key={q}>
                      <button
                        className="text-left text-teal-800 underline dark:text-teal-300"
                        onClick={() => {
                          setChatOpen(true);
                          setChatInput(`${q} Jawaban saya: `);
                        }}
                      >
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="grid gap-2">
            <button className="btn-primary" onClick={() => setChatOpen(true)}>
              <IconChat width={18} height={18} /> Lanjut chat dengan AI
            </button>
            <button className="btn-secondary" onClick={() => goTo('dokter', { tab: 'online' })}>
              <IconDoctor width={18} height={18} /> Chat / video dengan dokter
            </button>
            <button className="btn-secondary" onClick={() => goTo('dokter', { tab: 'rumah' })}>
              <IconHome width={18} height={18} /> Panggil dokter ke rumah
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400">Ringkasan AI ikut diteruskan ke dokter.</p>
          </section>

          {chatOpen && (
            <section className="card space-y-3" aria-label="Chat dengan AI">
              <h2 className="text-lg font-bold">Chat dengan AI</h2>
              <ul className="space-y-2">
                {chat.map((m, i) => (
                  <li
                    key={i}
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[15px] ${
                      m.role === 'user' ? 'ml-auto bg-teal-700 text-white' : 'bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    {m.text}
                  </li>
                ))}
              </ul>
              {busy && <Spinner label="AI sedang mengetik…" />}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendChat();
                }}
              >
                <label htmlFor="chat-input" className="sr-only">
                  Pesan
                </label>
                <input id="chat-input" className="input !py-2 !text-base" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Tulis pertanyaan…" />
                <button className="btn-primary !py-2" disabled={busy || !chatInput.trim()}>
                  Kirim
                </button>
              </form>
            </section>
          )}
          <Disclaimer />
        </div>
      )}
    </div>
  );
}
