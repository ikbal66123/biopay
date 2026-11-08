import { useState } from 'react';
import { BackHome, Notice } from '../components/Bits';
import { suggestMenus } from '../lib/menu';
import { CONDITION_LABEL, loadProfile, type Condition } from '../lib/profile';
import { rupiah } from '../lib/tariff';

const BUDGETS = [10000, 15000, 20000, 30000, 50000];

export default function MenuPage() {
  const [conditions, setConditions] = useState<Condition[]>(() => loadProfile().conditions);
  const [budget, setBudget] = useState(20000);
  const menus = suggestMenus(conditions, budget);

  return (
    <div className="space-y-4">
      <BackHome />
      <header>
        <h1 className="text-2xl font-bold">Menu Sehat Sesuai Kantong</h1>
        <p className="mt-1 text-[15px] text-slate-600 dark:text-slate-400">Pilihan makan sekali dari warteg atau masakan rumah.</p>
      </header>

      <section className="card space-y-3">
        <fieldset>
          <legend className="label">Anggaran sekali makan</legend>
          <div className="flex flex-wrap gap-2">
            {BUDGETS.map((b) => (
              <button key={b} className={`chip ${budget === b ? 'chip-on' : ''}`} aria-pressed={budget === b} onClick={() => setBudget(b)}>
                {rupiah(b)}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">Kondisi (dari Profil, bisa diubah di sini)</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CONDITION_LABEL) as Condition[]).map((c) => (
              <button
                key={c}
                className={`chip ${conditions.includes(c) ? 'chip-on' : ''}`}
                aria-pressed={conditions.includes(c)}
                onClick={() => setConditions((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))}
              >
                {CONDITION_LABEL[c]}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      {menus.length === 0 ? (
        <Notice tone="warn">Anggaran ini belum cukup untuk satu menu lengkap. Coba anggaran yang lebih besar.</Notice>
      ) : (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">{menus[0].why.join(' ')}</p>
          <ol className="space-y-3">
            {menus.map((m, i) => (
              <li key={i} className="card">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-bold">Pilihan {i + 1}</h2>
                  <span className="text-lg font-bold tabular-nums">{rupiah(m.total)}</span>
                </div>
                <ul className="mt-2 space-y-1 text-[15px]">
                  {m.dishes.map((d) => (
                    <li key={d.id} className="flex justify-between gap-2">
                      <span>{d.name}</span>
                      <span className="tabular-nums text-slate-500">{d.price ? rupiah(d.price) : 'gratis'}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Harga perkiraan dan bisa berbeda di tiap daerah. Untuk diet khusus dari dokter, ikuti anjuran dokter atau ahli gizi.
      </p>
    </div>
  );
}
