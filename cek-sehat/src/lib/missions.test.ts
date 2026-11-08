import { describe, expect, it } from 'vitest';
import { dailyMissions, needsDoctorApproval, streak, dateKey } from './missions';

const MON = new Date(2026, 10, 9, 8); // Senin
const TUE = new Date(2026, 10, 10, 8); // Selasa
const ids = (m: { id: string }[]) => m.map((x) => x.id);

describe('misi sehat harian', () => {
  it('orang sehat: misi dasar', () => {
    const m = dailyMissions({ conditions: [], date: MON, lastWeeklyCheck: MON.getTime() });
    expect(ids(m)).toEqual(['langkah', 'minum', 'buah', 'tidur']);
  });

  it('buah berganti tiap hari: Senin jeruk, Selasa pepaya', () => {
    expect(dailyMissions({ conditions: [], date: MON }).find((x) => x.id === 'buah')!.title).toMatch(/jeruk/);
    expect(dailyMissions({ conditions: [], date: TUE }).find((x) => x.id === 'buah')!.title).toMatch(/pepaya/);
  });

  it('hipertensi: kurangi garam, jalan 30 menit, tensi pagi dan malam', () => {
    const m = ids(dailyMissions({ conditions: ['hipertensi'], date: MON }));
    expect(m).toEqual(expect.arrayContaining(['jalan-30', 'garam', 'tensi-pagi', 'tensi-malam', 'obat']));
    expect(m).not.toContain('langkah');
  });

  it('diabetes: foto makan, jalan setelah makan, cek gula; karbo tinggi → misi makan malam', () => {
    const m = ids(dailyMissions({ conditions: ['diabetes'], date: MON }));
    expect(m).toEqual(expect.arrayContaining(['foto-makan', 'jalan-setelah-makan', 'cek-gula']));
    expect(m).not.toContain('karbo-malam');
    expect(ids(dailyMissions({ conditions: ['diabetes'], date: MON, carbsToday: 220 }))).toContain('karbo-malam');
  });

  it('demam/DBD: minum 2–3 liter, suhu tiap 6 jam, istirahat, tanpa misi olahraga', () => {
    const m = ids(dailyMissions({ conditions: ['demam'], date: MON }));
    expect(m).toEqual(expect.arrayContaining(['minum-demam', 'suhu-6jam', 'istirahat', 'tanda-bahaya']));
    expect(m).not.toContain('langkah');
    expect(m).not.toContain('minum');
  });

  it('makanan asin hari ini mengubah saran garam', () => {
    const g = dailyMissions({ conditions: ['hipertensi'], date: MON, saltyFoodToday: true }).find((x) => x.id === 'garam')!;
    expect(g.detail).toMatch(/makanan asin/);
  });

  it('cek mingguan muncul jika sudah 7 hari', () => {
    const week = 7 * 864e5;
    expect(ids(dailyMissions({ conditions: [], date: MON, lastWeeklyCheck: MON.getTime() - week }))).toContain('cek-mingguan');
    expect(ids(dailyMissions({ conditions: [], date: MON, lastWeeklyCheck: MON.getTime() - week + 1 }))).not.toContain('cek-mingguan');
  });

  it('penyakit kronis butuh persetujuan dokter', () => {
    expect(needsDoctorApproval(['diabetes'])).toBe(true);
    expect(needsDoctorApproval(['demam'])).toBe(false);
    expect(needsDoctorApproval([])).toBe(false);
  });

  it('streak hari berturut-turut', () => {
    const d = (n: number) => dateKey(new Date(2026, 10, n));
    expect(streak(new Set([d(7), d(8), d(9)]), MON)).toBe(3);
    expect(streak(new Set([d(7), d(8)]), MON)).toBe(2); // belum ada hari ini, dihitung sampai kemarin
    expect(streak(new Set([d(6)]), MON)).toBe(0);
  });
});
