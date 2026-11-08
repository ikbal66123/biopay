import { describe, expect, it } from 'vitest';
import { earlyWarnings } from './earlyWarning';
import type { Entry, EntryData } from './history';

const NOW = new Date(2026, 10, 8, 20, 0).getTime();
const DAY = 864e5;
let n = 0;
const e = (data: EntryData, daysAgo: number, hour = 8): Entry => {
  const d = new Date(NOW - daysAgo * DAY);
  d.setHours(hour, 0, 0, 0);
  return { ...data, id: String(n++), time: d.getTime(), label: '', level: 'normal' } as Entry;
};
const ids = (list: Entry[]) => earlyWarnings(list, NOW).map((w) => w.id);

describe('peringatan dini', () => {
  it('tanpa data → tidak ada peringatan', () => {
    expect(earlyWarnings([], NOW)).toEqual([]);
  });

  it('tensi naik 3 hari berturut-turut', () => {
    const list = [
      e({ type: 'tekanan', sys: 128, dia: 82 }, 2),
      e({ type: 'tekanan', sys: 134, dia: 84 }, 1),
      e({ type: 'tekanan', sys: 139, dia: 86 }, 0),
    ];
    expect(ids(list)).toContain('tensi-naik');
  });

  it('tensi naik tapi ada hari yang terlewat → bukan "3 hari berturut-turut"', () => {
    const list = [
      e({ type: 'tekanan', sys: 128, dia: 82 }, 4),
      e({ type: 'tekanan', sys: 134, dia: 84 }, 1),
      e({ type: 'tekanan', sys: 139, dia: 86 }, 0),
    ];
    expect(ids(list)).not.toContain('tensi-naik');
  });

  it('tensi naik tapi masih normal → tidak diperingatkan', () => {
    const list = [
      e({ type: 'tekanan', sys: 110, dia: 70 }, 2),
      e({ type: 'tekanan', sys: 112, dia: 70 }, 1),
      e({ type: 'tekanan', sys: 115, dia: 72 }, 0),
    ];
    expect(ids(list)).toEqual([]);
  });

  it('memakai rata-rata harian (pagi dan malam)', () => {
    const list = [
      e({ type: 'tekanan', sys: 130, dia: 80 }, 2, 7),
      e({ type: 'tekanan', sys: 126, dia: 80 }, 2, 20), // avg 128
      e({ type: 'tekanan', sys: 131, dia: 80 }, 1, 7),
      e({ type: 'tekanan', sys: 133, dia: 80 }, 1, 20), // avg 132
      e({ type: 'tekanan', sys: 140, dia: 85 }, 0, 7), // 140
    ];
    expect(ids(list)).toContain('tensi-naik');
  });

  it('tensi tinggi berulang dalam 7 hari', () => {
    const list = [e({ type: 'tekanan', sys: 150, dia: 95 }, 5), e({ type: 'tekanan', sys: 120, dia: 92 }, 2)];
    expect(ids(list)).toEqual(['tensi-tinggi-berulang']);
  });

  it('gula rendah → bahaya, ditaruh paling atas', () => {
    const list = [
      e({ type: 'tekanan', sys: 150, dia: 95 }, 5),
      e({ type: 'tekanan', sys: 150, dia: 95 }, 4),
      e({ type: 'gula', mgdl: 62, timing: 'sewaktu' }, 1),
    ];
    const w = earlyWarnings(list, NOW);
    expect(w[0].id).toBe('gula-rendah');
    expect(w[0].level).toBe('bahaya');
  });

  it('gula tinggi berulang', () => {
    const list = [e({ type: 'gula', mgdl: 130, timing: 'puasa' }, 3), e({ type: 'gula', mgdl: 210, timing: '2jam' }, 1)];
    expect(ids(list)).toContain('gula-tinggi-berulang');
    expect(ids([e({ type: 'gula', mgdl: 130, timing: 'sewaktu' }, 3), e({ type: 'gula', mgdl: 150, timing: 'sewaktu' }, 1)])).toEqual([]);
  });

  it('demam 3 hari → saran cek trombosit (DBD)', () => {
    const list = [e({ type: 'suhu', celsius: 38.5 }, 2), e({ type: 'suhu', celsius: 38.9 }, 1), e({ type: 'suhu', celsius: 38.2 }, 0)];
    const w = earlyWarnings(list, NOW).find((x) => x.id === 'demam-3-hari');
    expect(w?.message).toMatch(/trombosit/);
    expect(w?.message).toMatch(/ibuprofen/);
  });

  it('demam turun setelah demam → waspada fase kritis', () => {
    const list = [e({ type: 'suhu', celsius: 39 }, 3), e({ type: 'suhu', celsius: 38.4 }, 2), e({ type: 'suhu', celsius: 36.9 }, 0)];
    expect(ids(list)).toContain('demam-turun');
    expect(ids([e({ type: 'suhu', celsius: 36.8 }, 1), e({ type: 'suhu', celsius: 36.9 }, 0)])).toEqual([]);
  });

  it('detak jantung istirahat naik 3 hari dan di atas 100', () => {
    const list = [e({ type: 'detak', bpm: 92, source: 'kamera' }, 2), e({ type: 'detak', bpm: 98, source: 'kamera' }, 1), e({ type: 'detak', bpm: 106, source: 'kamera' }, 0)];
    expect(ids(list)).toContain('nadi-naik');
  });

  it('berat turun ≥5% dalam 30 hari', () => {
    const list = [e({ type: 'berat', weightKg: 70, heightCm: 165, bmi: 25.7 }, 25), e({ type: 'berat', weightKg: 66, heightCm: 165, bmi: 24.2 }, 0)];
    expect(ids(list)).toContain('berat-turun');
  });

  it('tidak memakai kalimat diagnosis', () => {
    const list = [
      e({ type: 'tekanan', sys: 128, dia: 82 }, 2),
      e({ type: 'tekanan', sys: 134, dia: 84 }, 1),
      e({ type: 'tekanan', sys: 165, dia: 100 }, 0),
      e({ type: 'gula', mgdl: 62, timing: 'sewaktu' }, 0),
      e({ type: 'suhu', celsius: 39 }, 3),
      e({ type: 'suhu', celsius: 38.4 }, 2),
      e({ type: 'suhu', celsius: 38.1 }, 1),
      e({ type: 'suhu', celsius: 37 }, 0),
    ];
    for (const w of earlyWarnings(list, NOW)) expect(`${w.title} ${w.message}`).not.toMatch(/anda menderita|didiagnosis|\d+\s*%/i);
  });
});
