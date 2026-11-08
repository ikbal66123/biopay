import { describe, expect, it } from 'vitest';
import { adherence, dosesFor, parseFrequency, type Medicine } from './meds';

describe('jadwal obat', () => {
  it.each([
    ['3x1', 3],
    ['3 x sehari 1 tablet', 3],
    ['2 kali sehari', 2],
    ['sekali sehari', 1],
    ['tiap 8 jam', 3],
    ['setiap 12 jam', 2],
    ['bila perlu', null],
    ['6x1', null],
  ])('"%s" → %s kali sehari', (t, n) => {
    expect(parseFrequency(t)).toBe(n);
  });

  const med: Medicine = { id: 'm1', name: 'Amlodipin', timesPerDay: 2, times: ['07:00', '19:00'], addedAt: new Date(2026, 10, 1).getTime() };

  it('dosis hari ini terurut jam, dengan status sudah diminum', () => {
    const day = new Date(2026, 10, 8, 10);
    const d = dosesFor([med], { '2026-11-08': ['m1@07:00'] }, day);
    expect(d.map((x) => [x.time, x.taken])).toEqual([
      ['07:00', true],
      ['19:00', false],
    ]);
  });

  it('kepatuhan 7 hari hanya menghitung dosis yang sudah lewat', () => {
    const today = new Date(2026, 10, 8, 10); // jam 10: dosis 19:00 hari ini belum dihitung
    const log: Record<string, string[]> = {};
    for (let d = 2; d <= 7; d++) log[`2026-11-0${d}`] = ['m1@07:00', 'm1@19:00'];
    log['2026-11-08'] = []; // pagi ini lupa
    // 6 hari penuh = 12 dosis diminum, + 1 dosis hari ini terlewat → 12/13
    expect(adherence([med], log, today)).toBeCloseTo(12 / 13);
  });

  it('tanpa obat → null', () => {
    expect(adherence([], {}, new Date())).toBeNull();
  });
});
