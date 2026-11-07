import { describe, expect, it } from 'vitest';
import { compactSignal, newParticipantCode, recordsToCsv, saveRecord, listRecords, clearRecords, type ResearchRecord } from './store';

const rec = (over: Partial<ResearchRecord> = {}): ResearchRecord => ({
  id: 'r1',
  time: Date.UTC(2026, 10, 7, 2, 0),
  participant: { code: 'P-ABCDE', ageGroup: '18–39', sex: 'P', skinTone: 'sedang' },
  condition: 'istirahat',
  ref: { bpm: 72, device: 'oksimeter' },
  app: { bpm: 73, bpmPeaks: 73.4, bpmFft: 72.6, quality: 0.87, channel: 'r' },
  signal: [
    [0, 180, 40],
    [33, 180.5, 40],
  ],
  userAgent: 'Test; Phone',
  appVersion: '1.0.0',
  ...over,
});

describe('data riset', () => {
  it('kode peserta anonim berformat P-XXXXX', () => {
    expect(newParticipantCode()).toMatch(/^P-[A-Z2-9]{5}$/);
  });

  it('sinyal dipadatkan: waktu relatif, 2 desimal', () => {
    expect(compactSignal([{ t: 1000, r: 180.1234, g: 40.5678 }, { t: 1033.4, r: 181 }])).toEqual([
      [0, 180.12, 40.57],
      [33, 181, 0],
    ]);
  });

  it('CSV: satu baris per pengukuran, kolom ditolak terisi saat aplikasi menolak', () => {
    const csv = recordsToCsv([rec(), rec({ id: 'r2', app: { bpm: null, bpmPeaks: NaN, bpmFft: 90, quality: 0.3, reason: 'Jari bergerak.', channel: 'r' } })]);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('r1;2026-11-07T02:00:00.000Z;P-ABCDE;18–39;P;sedang;istirahat;oksimeter;72;73;73.4;72.6;87;;r;2;"Test; Phone"');
    expect(lines[2].split(';')[9]).toBe('');
    expect(lines[2]).toContain('Jari bergerak.');
  });

  it('simpan dan baca (tanpa IndexedDB memakai memori)', async () => {
    await clearRecords();
    await saveRecord(rec({ id: 'b', time: 2 }));
    await saveRecord(rec({ id: 'a', time: 1 }));
    expect((await listRecords()).map((r) => r.id)).toEqual(['a', 'b']);
  });
});
