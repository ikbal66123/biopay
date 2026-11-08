/**
 * Healthy menu that fits the budget, from common warteg / home dishes.
 * Prices are rough 2026 estimates and differ by region.
 */
import type { Condition } from './profile';

type Level = 'rendah' | 'sedang' | 'tinggi';

export interface Dish {
  id: string;
  name: string;
  role: 'pokok' | 'lauk' | 'sayur' | 'buah' | 'minum';
  price: number;
  salt: Level;
  carbs: Level;
  sugar: Level;
  fried?: boolean;
  coconut?: boolean;
  /** easy to digest when sick */
  soft?: boolean;
}

export const DISHES: Dish[] = [
  // makanan pokok
  { id: 'nasi-putih', name: 'Nasi putih 1 porsi', role: 'pokok', price: 5000, salt: 'rendah', carbs: 'tinggi', sugar: 'rendah' },
  { id: 'nasi-setengah', name: 'Nasi putih ½ porsi', role: 'pokok', price: 3000, salt: 'rendah', carbs: 'sedang', sugar: 'rendah' },
  { id: 'nasi-merah', name: 'Nasi merah ½ porsi', role: 'pokok', price: 5000, salt: 'rendah', carbs: 'sedang', sugar: 'rendah' },
  { id: 'ubi-rebus', name: 'Ubi rebus', role: 'pokok', price: 4000, salt: 'rendah', carbs: 'sedang', sugar: 'sedang' },
  { id: 'bubur', name: 'Bubur nasi', role: 'pokok', price: 6000, salt: 'sedang', carbs: 'tinggi', sugar: 'rendah', soft: true },
  // lauk
  { id: 'telur-rebus', name: 'Telur rebus', role: 'lauk', price: 4000, salt: 'rendah', carbs: 'rendah', sugar: 'rendah', soft: true },
  { id: 'telur-dadar', name: 'Telur dadar', role: 'lauk', price: 5000, salt: 'sedang', carbs: 'rendah', sugar: 'rendah', fried: true },
  { id: 'tempe-bacem', name: 'Tempe bacem', role: 'lauk', price: 3000, salt: 'sedang', carbs: 'sedang', sugar: 'tinggi' },
  { id: 'tempe-kukus', name: 'Tempe atau tahu kukus/pepes', role: 'lauk', price: 4000, salt: 'rendah', carbs: 'rendah', sugar: 'rendah', soft: true },
  { id: 'tempe-goreng', name: 'Tempe goreng', role: 'lauk', price: 2000, salt: 'sedang', carbs: 'rendah', sugar: 'rendah', fried: true },
  { id: 'pepes-ikan', name: 'Pepes ikan', role: 'lauk', price: 10000, salt: 'sedang', carbs: 'rendah', sugar: 'rendah' },
  { id: 'ikan-bakar', name: 'Ikan kembung bakar', role: 'lauk', price: 10000, salt: 'sedang', carbs: 'rendah', sugar: 'sedang' },
  { id: 'ayam-rebus', name: 'Ayam suwir / sup ayam', role: 'lauk', price: 10000, salt: 'sedang', carbs: 'rendah', sugar: 'rendah', soft: true },
  { id: 'ayam-goreng', name: 'Ayam goreng', role: 'lauk', price: 12000, salt: 'sedang', carbs: 'rendah', sugar: 'rendah', fried: true },
  { id: 'ikan-asin', name: 'Ikan asin', role: 'lauk', price: 4000, salt: 'tinggi', carbs: 'rendah', sugar: 'rendah', fried: true },
  { id: 'rendang', name: 'Rendang', role: 'lauk', price: 15000, salt: 'tinggi', carbs: 'rendah', sugar: 'rendah', coconut: true },
  // sayur
  { id: 'sayur-bening', name: 'Sayur bening bayam', role: 'sayur', price: 3000, salt: 'rendah', carbs: 'rendah', sugar: 'rendah', soft: true },
  { id: 'sayur-asem', name: 'Sayur asem', role: 'sayur', price: 3000, salt: 'sedang', carbs: 'rendah', sugar: 'sedang' },
  { id: 'tumis-kangkung', name: 'Tumis kangkung', role: 'sayur', price: 4000, salt: 'sedang', carbs: 'rendah', sugar: 'rendah' },
  { id: 'lalapan', name: 'Lalapan (timun, kol, kemangi)', role: 'sayur', price: 2000, salt: 'rendah', carbs: 'rendah', sugar: 'rendah' },
  { id: 'sayur-lodeh', name: 'Sayur lodeh', role: 'sayur', price: 4000, salt: 'sedang', carbs: 'rendah', sugar: 'rendah', coconut: true },
  { id: 'sop-sayur', name: 'Sop sayur', role: 'sayur', price: 4000, salt: 'sedang', carbs: 'rendah', sugar: 'rendah', soft: true },
  // buah
  { id: 'pepaya', name: 'Pepaya sepotong', role: 'buah', price: 3000, salt: 'rendah', carbs: 'sedang', sugar: 'sedang', soft: true },
  { id: 'pisang', name: 'Pisang 1 buah', role: 'buah', price: 2500, salt: 'rendah', carbs: 'sedang', sugar: 'sedang', soft: true },
  { id: 'jeruk', name: 'Jeruk 1 buah', role: 'buah', price: 3000, salt: 'rendah', carbs: 'rendah', sugar: 'sedang' },
  { id: 'jambu-biji', name: 'Jambu biji', role: 'buah', price: 3000, salt: 'rendah', carbs: 'rendah', sugar: 'sedang' },
  // minum
  { id: 'air-putih', name: 'Air putih', role: 'minum', price: 0, salt: 'rendah', carbs: 'rendah', sugar: 'rendah' },
  { id: 'teh-tawar', name: 'Teh tawar', role: 'minum', price: 2000, salt: 'rendah', carbs: 'rendah', sugar: 'rendah' },
  { id: 'teh-manis', name: 'Es teh manis', role: 'minum', price: 4000, salt: 'rendah', carbs: 'tinggi', sugar: 'tinggi' },
];

export interface MenuCombo {
  dishes: Dish[];
  total: number;
  why: string[];
}

function allowed(d: Dish, c: Set<Condition>): boolean {
  if (c.has('hipertensi') && (d.salt === 'tinggi' || d.coconut)) return false;
  if (c.has('jantung') && (d.salt === 'tinggi' || d.fried || d.coconut)) return false;
  if (c.has('diabetes') && (d.sugar === 'tinggi' || (d.role === 'pokok' && d.carbs === 'tinggi'))) return false;
  if (c.has('demam') && (d.fried || d.coconut || d.salt === 'tinggi')) return false;
  if (!c.size && d.sugar === 'tinggi' && d.role === 'minum') return false;
  return true;
}

function reasons(c: Set<Condition>): string[] {
  const r: string[] = [];
  if (c.has('hipertensi')) r.push('Rendah garam: tanpa ikan asin, rendang, dan santan.');
  if (c.has('diabetes')) r.push('Karbohidrat dibatasi (nasi ½ porsi, nasi merah, atau ubi) dan tanpa minuman manis.');
  if (c.has('jantung')) r.push('Tanpa gorengan dan santan.');
  if (c.has('demam')) r.push('Mudah dicerna dan berkuah untuk membantu cukup cairan.');
  if (!r.length) r.push('Seimbang: makanan pokok, lauk berprotein, sayur, dan buah.');
  return r;
}

/**
 * Up to `limit` different combos (staple + protein + vegetable, plus fruit if
 * it fits) that respect the conditions and the budget, cheapest variety first.
 */
export function suggestMenus(conditions: Condition[], budget: number, limit = 3): MenuCombo[] {
  const c = new Set(conditions);
  const ok = DISHES.filter((d) => allowed(d, c));
  const byRole = (role: Dish['role']) => {
    const list = ok.filter((d) => d.role === role);
    // when sick, prefer soft food first
    return c.has('demam') ? [...list.filter((d) => d.soft), ...list.filter((d) => !d.soft)] : list;
  };
  const drink = ok.find((d) => d.id === 'air-putih')!;
  const combos: MenuCombo[] = [];
  const usedLauk = new Set<string>();

  for (const pokok of byRole('pokok')) {
    for (const lauk of byRole('lauk')) {
      if (usedLauk.has(lauk.id)) continue;
      for (const sayur of byRole('sayur')) {
        const core = [pokok, lauk, sayur];
        const coreTotal = core.reduce((s, d) => s + d.price, 0);
        if (coreTotal > budget) continue;
        const fruit = byRole('buah').find((b) => coreTotal + b.price <= budget);
        const dishes = [...core, ...(fruit ? [fruit] : []), drink];
        combos.push({ dishes, total: dishes.reduce((s, d) => s + d.price, 0), why: reasons(c) });
        usedLauk.add(lauk.id);
        break;
      }
      if (combos.length >= limit * 3) break;
    }
  }
  // vary: pick different staples where possible, then by price (best value = most complete under budget)
  combos.sort((a, b) => b.dishes.length - a.dishes.length || b.total - a.total);
  const picked: MenuCombo[] = [];
  const pokokSeen = new Set<string>();
  for (const m of combos) {
    if (picked.length >= limit) break;
    if (pokokSeen.has(m.dishes[0].id) && combos.some((x) => !pokokSeen.has(x.dishes[0].id) && !picked.includes(x))) continue;
    pokokSeen.add(m.dishes[0].id);
    picked.push(m);
  }
  for (const m of combos) if (picked.length < limit && !picked.includes(m)) picked.push(m);
  return picked;
}
