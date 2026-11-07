/** Rear camera + flash (torch) handling for the PPG measurement. */

export interface CameraHandle {
  stream: MediaStream;
  torch: boolean;
}

export class CameraError extends Error {
  constructor(
    public code: 'insecure' | 'unsupported' | 'denied' | 'notfound' | 'busy' | 'other',
    message: string,
  ) {
    super(message);
  }
}

const VIDEO: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 30 },
};

type TorchCaps = MediaTrackCapabilities & { torch?: boolean };

async function tryTorch(stream: MediaStream): Promise<boolean> {
  const track = stream.getVideoTracks()[0];
  if (!track) return false;
  try {
    const caps = (track.getCapabilities?.() ?? {}) as TorchCaps;
    if (!caps.torch) return false;
    await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
    return true;
  } catch {
    return false;
  }
}

export function stopCamera(stream: MediaStream | null | undefined) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      // turn the flash off explicitly; some Android phones leave it on otherwise
      void track.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] }).catch(() => {});
    } catch {
      /* ignore */
    }
    track.stop();
  }
}

function toCameraError(e: unknown): CameraError {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return new CameraError(
      'denied',
      'Izin kamera ditolak. Buka pengaturan browser, pilih izin situs, izinkan Kamera, lalu coba lagi.',
    );
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return new CameraError('notfound', 'Kamera belakang tidak ditemukan di perangkat ini.');
  if (name === 'NotReadableError' || name === 'AbortError')
    return new CameraError('busy', 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.');
  return new CameraError('other', 'Kamera tidak bisa dibuka. Coba muat ulang halaman.');
}

/**
 * Open the rear camera and switch on the flash when the device allows it.
 * Phones with several rear lenses sometimes open one without a flash first,
 * so other rear cameras are tried before giving up on the torch.
 */
export async function openRearCamera(): Promise<CameraHandle> {
  if (typeof window !== 'undefined' && !window.isSecureContext)
    throw new CameraError(
      'insecure',
      'Kamera hanya bisa dipakai jika aplikasi dibuka lewat alamat https:// (atau localhost).',
    );
  if (!navigator.mediaDevices?.getUserMedia)
    throw new CameraError('unsupported', 'Browser ini tidak mendukung akses kamera. Coba pakai Chrome atau Safari terbaru.');

  const open = (video: MediaTrackConstraints) => navigator.mediaDevices.getUserMedia({ video, audio: false });

  let stream: MediaStream;
  try {
    stream = await open({ ...VIDEO, facingMode: { ideal: 'environment' } });
  } catch (e) {
    throw toCameraError(e);
  }
  if (await tryTorch(stream)) return { stream, torch: true };

  try {
    const currentId = stream.getVideoTracks()[0]?.getSettings().deviceId;
    const backs = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === 'videoinput' && d.deviceId !== currentId && /back|rear|belakang|environment/i.test(d.label),
    );
    if (backs.length) {
      // many phones cannot open two cameras at once
      stopCamera(stream);
      for (const d of backs.slice(0, 4)) {
        try {
          const s = await open({ ...VIDEO, deviceId: { exact: d.deviceId } });
          if (await tryTorch(s)) return { stream: s, torch: true };
          stopCamera(s);
        } catch {
          /* try the next one */
        }
      }
    }
  } catch {
    /* enumerateDevices not available: keep what we have */
  }

  if (!stream.active) {
    try {
      stream = await open({ ...VIDEO, facingMode: { ideal: 'environment' } });
    } catch (e) {
      throw toCameraError(e);
    }
  }
  return { stream, torch: false };
}
