/**
 * Bluetooth health devices through the standard Bluetooth SIG health profiles,
 * so many brands work without brand-specific code.
 * Works in Chrome on Android, Windows, macOS and ChromeOS (Web Bluetooth).
 * Safari / iPhone does not support Web Bluetooth.
 */

/* ------------------------------------------------ IEEE-11073 numbers */

/** 16-bit SFLOAT: 4-bit signed exponent, 12-bit signed mantissa. NaN for special values. */
export function sfloat(raw: number): number {
  const v = raw & 0xffff;
  if (v === 0x07ff || v === 0x0800 || v === 0x07fe || v === 0x0802 || v === 0x0801) return NaN;
  let mantissa = v & 0x0fff;
  let exponent = v >> 12;
  if (mantissa >= 0x0800) mantissa -= 0x1000;
  if (exponent >= 0x8) exponent -= 0x10;
  return round(mantissa * 10 ** exponent);
}

/** 32-bit FLOAT: 8-bit signed exponent, 24-bit signed mantissa. */
export function float32(raw: number): number {
  const v = raw >>> 0;
  let mantissa = v & 0x00ffffff;
  let exponent = v >>> 24;
  if (mantissa === 0x007fffff || mantissa === 0x00800000 || mantissa === 0x007ffffe || mantissa === 0x00800002) return NaN;
  if (mantissa >= 0x00800000) mantissa -= 0x01000000;
  if (exponent >= 0x80) exponent -= 0x100;
  return round(mantissa * 10 ** exponent);
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/* ----------------------------------------------------------- readings */

export type Reading =
  | { kind: 'tekanan'; sys: number; dia: number; pulse?: number }
  | { kind: 'suhu'; celsius: number }
  | { kind: 'gula'; mgdl: number }
  | { kind: 'oksimeter'; spo2: number; pulse: number }
  | { kind: 'berat'; kg: number }
  | { kind: 'detak'; bpm: number };

const u16 = (d: DataView, o: number) => d.getUint16(o, true);

/** Blood Pressure Measurement (0x2A35). */
export function parseBloodPressure(d: DataView): Reading {
  const flags = d.getUint8(0);
  const kpa = (flags & 0x01) !== 0;
  const k = kpa ? 7.50062 : 1;
  let o = 1;
  const sys = sfloat(u16(d, o)) * k;
  const dia = sfloat(u16(d, o + 2)) * k;
  o += 6; // sys, dia, mean arterial pressure
  if (flags & 0x02) o += 7; // time stamp
  let pulse: number | undefined;
  if (flags & 0x04) pulse = sfloat(u16(d, o));
  return { kind: 'tekanan', sys: Math.round(sys), dia: Math.round(dia), ...(pulse !== undefined && Number.isFinite(pulse) ? { pulse: Math.round(pulse) } : {}) };
}

/** Temperature Measurement (0x2A1C). */
export function parseTemperature(d: DataView): Reading {
  const flags = d.getUint8(0);
  let t = float32(d.getUint32(1, true));
  if (flags & 0x01) t = ((t - 32) * 5) / 9;
  return { kind: 'suhu', celsius: Math.round(t * 10) / 10 };
}

/** Glucose Measurement (0x2A18). */
export function parseGlucose(d: DataView): Reading | null {
  const flags = d.getUint8(0);
  let o = 1 + 2 + 7; // flags, sequence number, base time
  if (flags & 0x01) o += 2; // time offset
  if (!(flags & 0x02)) return null; // no concentration in this record
  const value = sfloat(u16(d, o));
  // units: 0 = kg/L, 1 = mol/L
  const mgdl = flags & 0x04 ? value * 1000 * 18.016 : value * 100000;
  return { kind: 'gula', mgdl: Math.round(mgdl) };
}

/** PLX Spot-check (0x2A5E) and Continuous (0x2A5F): flags, SpO2, pulse rate. */
export function parsePulseOximeter(d: DataView): Reading {
  return { kind: 'oksimeter', spo2: Math.round(sfloat(u16(d, 1))), pulse: Math.round(sfloat(u16(d, 3))) };
}

/** Weight Measurement (0x2A9D). */
export function parseWeight(d: DataView): Reading {
  const flags = d.getUint8(0);
  const raw = u16(d, 1);
  const kg = flags & 0x01 ? raw * 0.01 * 0.45359237 : raw * 0.005;
  return { kind: 'berat', kg: Math.round(kg * 10) / 10 };
}

/** Heart Rate Measurement (0x2A37): chest straps and many smartwatches in broadcast mode. */
export function parseHeartRate(d: DataView): Reading {
  const flags = d.getUint8(0);
  return { kind: 'detak', bpm: flags & 0x01 ? u16(d, 1) : d.getUint8(1) };
}

/* ----------------------------------------------------------- profiles */

export interface DeviceProfile {
  id: string;
  label: string;
  service: number;
  characteristic: number;
  /** indications (most health devices) vs notifications */
  parse: (d: DataView) => Reading | null;
}

export const PROFILES: DeviceProfile[] = [
  { id: 'tensi', label: 'Tensimeter', service: 0x1810, characteristic: 0x2a35, parse: parseBloodPressure },
  { id: 'gula', label: 'Alat cek gula darah', service: 0x1808, characteristic: 0x2a18, parse: parseGlucose },
  { id: 'suhu', label: 'Termometer', service: 0x1809, characteristic: 0x2a1c, parse: parseTemperature },
  { id: 'oksimeter', label: 'Oksimeter', service: 0x1822, characteristic: 0x2a5f, parse: parsePulseOximeter },
  { id: 'timbangan', label: 'Timbangan', service: 0x181d, characteristic: 0x2a9d, parse: parseWeight },
  { id: 'detak', label: 'Sabuk / jam detak jantung', service: 0x180d, characteristic: 0x2a37, parse: parseHeartRate },
];

/* ------------------------------------------------------- Web Bluetooth */

// Minimal typings: Web Bluetooth is not in TypeScript's DOM lib.
interface BtCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<BtCharacteristic>;
  stopNotifications(): Promise<BtCharacteristic>;
}
interface BtDevice extends EventTarget {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{
      getPrimaryService(s: number): Promise<{ getCharacteristic(c: number): Promise<BtCharacteristic> }>;
    }>;
    disconnect(): void;
  };
}
interface Bt {
  getAvailability?(): Promise<boolean>;
  requestDevice(o: { filters: { services: number[] }[] }): Promise<BtDevice>;
}

function bt(): Bt | undefined {
  return (navigator as unknown as { bluetooth?: Bt }).bluetooth;
}

export function bluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && !!bt();
}

export interface Connection {
  deviceName: string;
  disconnect: () => void;
}

/**
 * Ask the user to pick a device (the browser shows its own chooser), connect,
 * and call `onReading` for each measurement the device sends.
 */
export async function connectDevice(
  profile: DeviceProfile,
  onReading: (r: Reading) => void,
  onDisconnect: () => void,
): Promise<Connection> {
  const b = bt();
  if (!b) throw new Error('Browser ini belum mendukung Bluetooth. Pakai Chrome di Android atau komputer.');
  const device = await b.requestDevice({ filters: [{ services: [profile.service] }] });
  if (!device.gatt) throw new Error('Perangkat tidak bisa disambungkan.');
  device.addEventListener('gattserverdisconnected', onDisconnect);
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(profile.service);
  const ch = await service.getCharacteristic(profile.characteristic);
  ch.addEventListener('characteristicvaluechanged', () => {
    if (!ch.value) return;
    try {
      const r = profile.parse(ch.value);
      if (r) onReading(r);
    } catch {
      /* malformed packet: ignore */
    }
  });
  await ch.startNotifications();
  return {
    deviceName: device.name || profile.label,
    disconnect: () => {
      device.removeEventListener('gattserverdisconnected', onDisconnect);
      if (device.gatt?.connected) device.gatt.disconnect();
    },
  };
}
