import { describe, expect, it } from 'vitest';
import { DANGER_SIGNS, MILD_SIGNS, MODERATE_SIGNS, triage } from './triage';

describe('Triase gejala', () => {
  it('tanpa pilihan → kosong', () => {
    expect(triage([]).level).toBe('kosong');
  });

  it.each(DANGER_SIGNS.map((s) => s.id))('satu tanda bahaya (%s) saja → IGD', (id) => {
    expect(triage([id]).level).toBe('igd');
  });

  it.each(MODERATE_SIGNS.map((s) => s.id))('keluhan sedang (%s) → dokter dalam 24 jam', (id) => {
    expect(triage([id]).level).toBe('dokter24');
  });

  it.each(MILD_SIGNS.map((s) => s.id))('keluhan ringan (%s) → rawat di rumah dengan tips', (id) => {
    const r = triage([id]);
    expect(r.level).toBe('rumah');
    expect(r.tips.length).toBeGreaterThan(0);
  });

  it('kelompok paling berat menang', () => {
    expect(triage(['pilek', 'demam-3hari', 'kejang']).level).toBe('igd');
    expect(triage(['pilek', 'pegal', 'demam-bintik']).level).toBe('dokter24');
  });

  it('alasan berisi hanya gejala dari kelompok yang menentukan', () => {
    const r = triage(['pilek', 'nyeri-dada']);
    expect(r.reasons).toEqual([DANGER_SIGNS[0].label]);
  });

  it('tips tidak duplikat dan id yang tidak dikenal diabaikan', () => {
    const r = triage(['pilek', 'pilek', 'tidak-ada']);
    expect(r.level).toBe('rumah');
    expect(new Set(r.tips).size).toBe(r.tips.length);
    expect(triage(['tidak-ada']).level).toBe('kosong');
  });

  it('id unik di semua daftar', () => {
    const ids = [...DANGER_SIGNS, ...MODERATE_SIGNS, ...MILD_SIGNS].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
