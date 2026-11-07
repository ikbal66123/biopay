import { useEffect, useState } from 'react';
import EmergencyBanner from './components/EmergencyBanner';
import Welcome from './components/Welcome';
import { IconCalc, IconHeart, IconHistory, IconStethoscope } from './components/Icons';
import HeartRatePage from './pages/HeartRatePage';
import CheckNumbersPage from './pages/CheckNumbersPage';
import SymptomsPage from './pages/SymptomsPage';
import HistoryPage from './pages/HistoryPage';
import ResearchPage from './pages/ResearchPage';
import { readPref, writePref } from './lib/prefs';

type Tab = 'jantung' | 'angka' | 'gejala' | 'riwayat' | 'riset';

const TABS: { id: Tab; label: string; Icon: typeof IconHeart }[] = [
  { id: 'jantung', label: 'Detak Jantung', Icon: IconHeart },
  { id: 'angka', label: 'Cek Angka', Icon: IconCalc },
  { id: 'gejala', label: 'Cek Gejala', Icon: IconStethoscope },
  { id: 'riwayat', label: 'Riwayat', Icon: IconHistory },
];

function tabFromHash(): Tab {
  const h = window.location.hash.replace('#', '') as Tab;
  // "riset" (research mode) is reached from the Riwayat page, not from the tab bar
  return h === 'riset' || TABS.some((t) => t.id === h) ? h : 'jantung';
}

export default function App() {
  const [accepted, setAccepted] = useState(() => readPref('accepted') === '1');
  const [tab, setTab] = useState<Tab>(tabFromHash);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (t: Tab) => {
    window.location.hash = t;
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen">
      <EmergencyBanner />
      {!accepted ? (
        <Welcome
          onAccept={() => {
            writePref('accepted', '1');
            setAccepted(true);
          }}
        />
      ) : (
        <>
          <main className="mx-auto max-w-md px-4 pb-28 pt-4">
            {tab === 'jantung' && <HeartRatePage />}
            {tab === 'angka' && <CheckNumbersPage />}
            {tab === 'gejala' && <SymptomsPage />}
            {tab === 'riwayat' && <HistoryPage />}
            {tab === 'riset' && <ResearchPage />}
          </main>
          <nav
            className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
            aria-label="Menu utama"
          >
            <div className="mx-auto grid max-w-md grid-cols-4 pb-[env(safe-area-inset-bottom)]">
              {TABS.map(({ id, label, Icon }) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    onClick={() => go(id)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${
                      active ? 'text-teal-700 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <span className={`rounded-full px-4 py-1 ${active ? 'bg-teal-100 dark:bg-teal-900/60' : ''}`}>
                      <Icon width={22} height={22} />
                    </span>
                    {label}
                  </button>
                );
              })}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
