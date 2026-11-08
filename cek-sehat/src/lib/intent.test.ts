import { describe, expect, it } from 'vitest';
import { isEmergency, parseIntent } from './intent';

describe('asisten suara: arah ke fitur', () => {
  it.each([
    ['Aku mau cek detak jantung', 'jantung'],
    ['tolong ukur denyut', 'jantung'],
    ['cek tensi', 'angka'],
    ['gula darahku berapa ya', 'angka'],
    ['Panggil dokter', 'dokter'],
    ['aku mau foto makanan', 'foto-makanan'],
    ['jadwal minum obat', 'foto-obat'],
    ['menu warteg murah', 'menu'],
    ['lihat riwayat', 'riwayat'],
    ['misi hari ini', 'misi'],
    ['sambungkan alat bluetooth', 'alat'],
    ['kabari keluarga', 'keluarga'],
  ])('"%s" → %s', (text, route) => {
    expect(parseIntent(text)?.route).toBe(route);
  });

  it('keluhan → analisis AI dengan teks sudah terisi', () => {
    const i = parseIntent('Kepalaku pusing sejak kemarin');
    expect(i?.route).toBe('tanya-ai');
    expect(i?.prefill).toBe('Kepalaku pusing sejak kemarin');
  });

  it('bahasa daerah: Jawa dan Sunda', () => {
    expect(parseIntent('sirahku ngelu wis rong dina')?.route).toBe('tanya-ai'); // Jawa: pusing
    expect(parseIntent('abdi lieur ti kamari')?.route).toBe('tanya-ai'); // Sunda: pusing
    expect(parseIntent('awakku greges')?.route).toBe('tanya-ai'); // Jawa: meriang
  });

  it('keluhan yang menyebut dokter tetap ke analisis keluhan', () => {
    expect(parseIntent('perlu ke dokter gak kalau batuk terus')?.route).toBe('tanya-ai');
  });

  it('pengukuran mulai otomatis', () => {
    expect(parseIntent('cek detak jantung')?.autostart).toBe(true);
    expect(parseIntent('cek tensi')?.kind).toBe('tensi');
  });

  it('tidak dikenali → null', () => {
    expect(parseIntent('halo apa kabar')).toBeNull();
    expect(parseIntent('   ')).toBeNull();
  });
});

describe('asisten suara: darurat selalu menang', () => {
  it.each([
    'dadaku nyeri dada menjalar ke lengan',
    'bapak pingsan',
    'anak saya kejang',
    'ibu bicaranya pelo dan wajahnya mencong',
    'sesak napas berat',
    'ora iso ambegan', // Jawa: tidak bisa bernapas
    'muntah darah',
    'ada kecelakaan',
    'Mau cek detak jantung, tapi nyeri dada',
  ])('"%s" → darurat', (text) => {
    expect(isEmergency(text)).toBe(true);
    expect(parseIntent(text)?.route).toBe('darurat');
  });

  it('kalimat biasa tidak dianggap darurat', () => {
    expect(isEmergency('tolong ukur tensi saya')).toBe(false);
    expect(isEmergency('pusing sedikit')).toBe(false);
  });
});
