import { useEffect, useRef, useState } from 'react';
import { parseIntent, VOICE_LANGS } from '../lib/intent';
import { goTo } from '../lib/nav';
import { readPref, writePref } from '../lib/prefs';
import { IconMic } from './Icons';

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

function getRecognizer(): (new () => Rec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speak(text: string) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'id-ID';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

export default function VoiceAssistant() {
  const Recognizer = getRecognizer();
  const [lang, setLang] = useState(() => readPref('suara:bahasa') ?? 'id-ID');
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [typed, setTyped] = useState('');
  const recRef = useRef<Rec | null>(null);

  useEffect(() => () => recRef.current?.stop(), []);

  const act = (text: string) => {
    const intent = parseIntent(text);
    if (!intent) {
      const msg = 'Maaf, saya belum paham. Coba katakan misalnya: cek detak jantung, kepala saya pusing, atau panggil dokter.';
      setReply(msg);
      speak(msg);
      return;
    }
    setReply(intent.reply);
    speak(intent.reply);
    // move straight to the feature, no extra tap needed
    setTimeout(
      () => goTo(intent.route, { prefill: intent.prefill, autostart: intent.autostart, kind: intent.kind }),
      intent.route === 'darurat' ? 0 : 900,
    );
  };

  const listen = () => {
    if (!Recognizer) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const greeting = 'Halo, ada yang bisa saya bantu?';
    setReply(greeting);
    setHeard('');
    speak(greeting);
    const rec = new Recognizer();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText = text;
      }
      setHeard(text);
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === 'not-allowed') setReply('Izin mikrofon ditolak. Anda bisa mengetik di kotak di bawah.');
      else if (e.error === 'no-speech') setReply('Saya tidak mendengar suara. Tekan tombol lalu bicara.');
      else if (e.error === 'network') setReply('Pengenalan suara butuh internet. Anda bisa mengetik di kotak di bawah.');
    };
    rec.onend = () => {
      setListening(false);
      if (finalText) act(finalText);
    };
    recRef.current = rec;
    // give the greeting a moment so the microphone does not hear it
    setTimeout(() => {
      try {
        rec.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    }, 1300);
  };

  return (
    <section className="card space-y-3" aria-label="Asisten suara">
      <div className="flex items-center gap-4">
        <button
          onClick={listen}
          disabled={!Recognizer}
          aria-label={listening ? 'Berhenti mendengarkan' : 'Bicara dengan asisten'}
          className={`grid h-20 w-20 shrink-0 place-items-center rounded-full text-white shadow-lg transition ${
            listening ? 'animate-pulse bg-red-600' : 'bg-teal-700 hover:bg-teal-800 dark:bg-teal-600'
          } disabled:bg-slate-400`}
        >
          <IconMic width={36} height={36} />
        </button>
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight">{listening ? 'Saya mendengarkan…' : 'Tekan dan bicara'}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {Recognizer ? 'Contoh: "cek detak jantung", "kepala saya pusing", "panggil dokter".' : 'Browser ini belum mendukung suara. Silakan ketik.'}
          </p>
        </div>
      </div>
      {Recognizer && (
        <div className="flex gap-2" role="group" aria-label="Bahasa">
          {VOICE_LANGS.map((l) => (
            <button
              key={l.code}
              className={`chip !py-1 text-xs ${lang === l.code ? 'chip-on' : ''}`}
              aria-pressed={lang === l.code}
              onClick={() => {
                setLang(l.code);
                writePref('suara:bahasa', l.code);
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
      {heard && <p className="rounded-xl bg-slate-100 p-3 text-[15px] italic dark:bg-slate-800">“{heard}”</p>}
      {reply && (
        <p className="text-[15px] font-medium text-teal-800 dark:text-teal-300" aria-live="polite">
          {reply}
        </p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) act(typed);
        }}
      >
        <label htmlFor="asisten-ketik" className="sr-only">
          Ketik permintaan
        </label>
        <input
          id="asisten-ketik"
          className="input !py-2 !text-base"
          placeholder="Atau ketik di sini…"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button className="btn-primary !py-2" type="submit">
          Kirim
        </button>
      </form>
      {Recognizer && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Pengenalan suara memakai layanan bawaan browser (butuh internet). Pilihan Jawa/Sunda bergantung pada dukungan browser.
        </p>
      )}
    </section>
  );
}
