import { useEffect, useState } from 'react';
import EmergencyBanner from './components/EmergencyBanner';
import Welcome from './components/Welcome';
import { IconCalc, IconHeart, IconHistory, IconHome, IconStethoscope } from './components/Icons';
import HeartRatePage from './pages/HeartRatePage';
import CheckNumbersPage from './pages/CheckNumbersPage';
import SymptomsPage from './pages/SymptomsPage';
import HistoryPage from './pages/HistoryPage';
import ResearchPage from './pages/ResearchPage';
import HomePage from './pages/HomePage';
import EmergencyPage from './pages/EmergencyPage';
import AskAiPage from './pages/AskAiPage';
import DoctorPage from './pages/DoctorPage';
import FoodPage from './pages/FoodPage';
import MedicinePage from './pages/MedicinePage';
import MenuPage from './pages/MenuPage';
import MissionsPage from './pages/MissionsPage';
import DevicesPage from './pages/DevicesPage';
import FamilyPage from './pages/FamilyPage';
import ProfilePage from './pages/ProfilePage';
import DoctorDashboardPage from './pages/DoctorDashboardPage';
import { readPref, writePref } from './lib/prefs';

/** Screens reached from the Beranda (home), not from the tab bar. */
const PAGES = {
  riset: ResearchPage,
  darurat: EmergencyPage,
  'tanya-ai': AskAiPage,
  dokter: DoctorPage,
  'foto-makanan': FoodPage,
  'foto-obat': MedicinePage,
  menu: MenuPage,
  misi: MissionsPage,
  alat: DevicesPage,
  keluarga: FamilyPage,
  profil: ProfilePage,
  'dashboard-dokter': DoctorDashboardPage,
} as const;

type Tab = 'beranda' | 'jantung' | 'angka' | 'gejala' | 'riwayat' | keyof typeof PAGES;

const TABS: { id: Tab; label: string; Icon: typeof IconHeart }[] = [
  { id: 'beranda', label: 'Beranda', Icon: IconHome },
  { id: 'jantung', label: 'Detak Jantung', Icon: IconHeart },
  { id: 'angka', label: 'Cek Angka', Icon: IconCalc },
  { id: 'gejala', label: 'Cek Gejala', Icon: IconStethoscope },
  { id: 'riwayat', label: 'Riwayat', Icon: IconHistory },
];

function tabFromHash(): Tab {
  const h = window.location.hash.replace('#', '') as Tab;
  return h in PAGES || TABS.some((t) => t.id === h) ? h : 'beranda';
}

export default function App() {
  const [accepted, setAccepted] = useState(() => readPref('accepted') === '1');
  const [tab, setTab] = useState<Tab>(tabFromHash);

  useEffect(() => {
    const onHash = () => {
      setTab(tabFromHash());
      window.scrollTo({ top: 0 });
    };
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
            {tab === 'beranda' && <HomePage />}
            {tab in PAGES && (() => {
              const Page = PAGES[tab as keyof typeof PAGES];
              return <Page key={tab} />;
            })()}
          </main>
          <nav
            className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
            aria-label="Menu utama"
          >
            <div className="mx-auto grid max-w-md grid-cols-5 pb-[env(safe-area-inset-bottom)]">
              {TABS.map(({ id, label, Icon }) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    onClick={() => go(id)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold leading-tight ${
                      active ? 'text-teal-700 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <span className={`rounded-full px-3 py-1 ${active ? 'bg-teal-100 dark:bg-teal-900/60' : ''}`}>
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
