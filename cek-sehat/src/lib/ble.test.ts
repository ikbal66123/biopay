import { describe, expect, it } from 'vitest';
import {
  float32,
  parseBloodPressure,
  parseGlucose,
  parseHeartRate,
  parsePulseOximeter,
  parseTemperature,
  parseWeight,
  sfloat,
} from './ble';

const view = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);
/** encode SFLOAT little-endian */
const sf = (mantissa: number, exp: number) => {
  const v = ((exp & 0xf) << 12) | (mantissa & 0x0fff);
  return [v & 0xff, v >> 8];
};
const f32 = (mantissa: number, exp: number) => {
  const v = (((exp & 0xff) << 24) | (mantissa & 0xffffff)) >>> 0;
  return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24];
};

describe('angka IEEE-11073', () => {
  it('SFLOAT', () => {
    expect(sfloat(0x0078)).toBe(120); // 120 × 10^0
    expect(sfloat(0xf16e)).toBe(36.6); // 366 × 10^-1
    expect(sfloat(0x0fff)).toBe(-1); // mantissa -1
    expect(sfloat(0x07ff)).toBeNaN(); // NaN
    expect(sfloat(0x0800)).toBeNaN(); // NRes
  });
  it('FLOAT', () => {
    expect(float32(0xfe000e4b)).toBe(36.59); // 3659 × 10^-2
    expect(float32(0x007fffff)).toBeNaN();
  });
});

describe('profil Bluetooth kesehatan', () => {
  it('tensimeter mmHg dengan nadi dan waktu', () => {
    const r = parseBloodPressure(view([0x06, ...sf(135, 0), ...sf(85, 0), ...sf(102, 0), 0xea, 0x07, 11, 8, 7, 30, 0, ...sf(78, 0)]));
    expect(r).toEqual({ kind: 'tekanan', sys: 135, dia: 85, pulse: 78 });
  });
  it('tensimeter dalam kPa diubah ke mmHg', () => {
    const r = parseBloodPressure(view([0x01, ...sf(160, -1), ...sf(107, -1), ...sf(125, -1)]));
    expect(r).toEqual({ kind: 'tekanan', sys: 120, dia: 80 });
  });
  it('termometer Celsius dan Fahrenheit', () => {
    expect(parseTemperature(view([0x00, ...f32(3680, -2)]))).toEqual({ kind: 'suhu', celsius: 36.8 });
    expect(parseTemperature(view([0x01, ...f32(1004, -1)]))).toEqual({ kind: 'suhu', celsius: 38 });
  });
  it('glukometer kg/L dan mol/L ke mg/dL', () => {
    // 0.00110 kg/L = 110 mg/dL
    const base = [0x01, 0x00, 0xea, 0x07, 11, 8, 7, 0, 0];
    expect(parseGlucose(view([0x02, ...base, ...sf(110, -5), 0x11]))).toEqual({ kind: 'gula', mgdl: 110 });
    // 0.0061 mol/L = 6.1 mmol/L ≈ 110 mg/dL
    expect(parseGlucose(view([0x06, ...base, ...sf(61, -4), 0x11]))).toEqual({ kind: 'gula', mgdl: 110 });
    // with time offset
    expect(parseGlucose(view([0x03, ...base, 0x00, 0x00, ...sf(95, -5), 0x11]))).toEqual({ kind: 'gula', mgdl: 95 });
    // record without a concentration
    expect(parseGlucose(view([0x00, ...base]))).toBeNull();
  });
  it('oksimeter', () => {
    expect(parsePulseOximeter(view([0x00, ...sf(97, 0), ...sf(72, 0)]))).toEqual({ kind: 'oksimeter', spo2: 97, pulse: 72 });
  });
  it('timbangan kg dan lb', () => {
    // 12900 × 0.005 = 64.5 kg
    expect(parseWeight(view([0x00, 12900 & 0xff, 12900 >> 8]))).toEqual({ kind: 'berat', kg: 64.5 });
    // 15000 × 0.01 lb = 150 lb = 68.0 kg
    expect(parseWeight(view([0x01, 15000 & 0xff, 15000 >> 8]))).toEqual({ kind: 'berat', kg: 68 });
  });
  it('detak jantung 8 bit dan 16 bit', () => {
    expect(parseHeartRate(view([0x00, 72]))).toEqual({ kind: 'detak', bpm: 72 });
    expect(parseHeartRate(view([0x01, 0x2c, 0x01]))).toEqual({ kind: 'detak', bpm: 300 });
  });
});
