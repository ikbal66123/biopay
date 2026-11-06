"""Tahap 2: perlindungan VIDEO dengan memakai ulang serangan encoder Tahap 1.

Alur (4 lintasan, memori tetap kecil walau videonya panjang):

  1. DETEKSI  : decode semua frame, deteksi wajah, lacak (tracking) & haluskan kotak,
                deteksi pergantian adegan.
  2. KEYFRAME : per track wajah, pilih keyframe tiap `key_interval` frame, ambil crop
                wajah persegi lalu samakan ukurannya (ukuran kanonik S x S).
  3. OPTIMASI : PGD batch di GPU pada crop keyframe (memakai `EncoderAttack.attack_batch`
                dari Tahap 1) dengan EOT khusus video: resize kuat, blur, JPEG,
                subsampling warna 4:2:0, dan H.264 sungguhan via FFmpeg.
                Perturbasi = komponen BERSAMA satu track + residual kecil per keyframe,
                sehingga keyframe yang berdekatan punya pola yang hampir sama.
  4. TULIS    : decode lagi; untuk tiap frame, perturbasi diinterpolasi linear antara
                dua keyframe terdekat (di ruang crop wajah, jadi ikut bergerak bersama
                wajah), diklem ke batas eps frame itu, lalu ditulis ke H.264 + audio asli.

Frame tanpa wajah tidak diubah (selain encode ulang berkualitas tinggi).
"""

from __future__ import annotations

import bisect
import math
import shutil
import tempfile
import time
from dataclasses import asdict, dataclass, field, replace
from pathlib import Path
from typing import Sequence

import cv2
import numpy as np
import torch

from .device import pick_device
from .faces import FaceDetector
from .identity_attack import available as identity_available
from .imageio import to_tensor
from .manifest import write_manifest
from .photoguard import DEFAULT_VAE, EncoderAttack, ProtectConfig, make_config, texture_eps_map
from .tracking import FaceTracker, Track
from .videoio import VideoWriter, extract_audio, iter_frames, probe
from .watermark import embed_watermark

# Preset video: (pengaturan video, override ProtectConfig)
VIDEO_PRESETS: dict[str, tuple[dict, dict]] = {
    "fast": (dict(key_interval=15), dict(steps=40, step_size=2 / 255)),
    "balanced": (dict(key_interval=10), dict(steps=80, step_size=1.5 / 255)),
    "strong": (dict(key_interval=5), dict(steps=200, step_size=1 / 255, eps=10 / 255, eot_samples=2)),
}

# EOT untuk video: penyerang biasanya memperkecil seluruh frame (wajah jadi kecil),
# dan platform memakai H.264 + 4:2:0 dengan bitrate rendah.
VIDEO_EOT = dict(resize_range=(0.4, 1.0), jpeg_prob=0.3, jpeg_quality=(40, 90), blur_prob=0.3,
                 noise_std=0.01, chroma_prob=0.5, h264_prob=0.25, h264_crf=(23, 33))


@dataclass
class VideoProtectConfig:
    preset: str = "balanced"
    key_interval: int | None = None    # None = dari preset
    batch_size: int = 4                # keyframe per batch GPU
    crop_min: int = 128                # ukuran kanonik crop wajah (piksel)
    crop_max: int = 512
    residual_ratio: float = 0.3        # (mode temporal) residual per keyframe <= 30% eps
    # True = pola BERSAMA per wajah + residual kecil per keyframe. Terukur: tidak mengurangi flicker
    # (interpolasi sudah menghaluskan) tetapi melemahkan serangan identitas, jadi default False.
    temporal: bool = False
    margin: float = 0.35               # perluasan kotak wajah (rambut, telinga, dagu)
    detector: str = "auto"
    detect_size: int = 640
    max_faces: int = 4
    scene_cut: float = 0.30            # ambang beda rata-rata thumbnail untuk pergantian adegan
    crf: int = 14                      # kualitas output (makin kecil makin bagus/besar)
    x264_preset: str = "slow"
    identity: str = "auto"             # serangan identitas ArcFace (anti face-swap): auto / on / off
    identity_weight: float = 1.0
    watermark: bool = False
    owner: str = "anonymous"
    seed: int = 0
    protect_overrides: dict = field(default_factory=dict)  # override ProtectConfig (eps, steps, dst.)

    def protect_config(self) -> ProtectConfig:
        vid, prot = VIDEO_PRESETS[self.preset]
        return make_config("balanced", **{**VIDEO_EOT, **prot, "seed": self.seed, **self.protect_overrides})

    def interval(self) -> int:
        return max(1, self.key_interval or VIDEO_PRESETS[self.preset][0]["key_interval"])


def canonical_mask(size: int, margin: float) -> np.ndarray:
    """Mask elips berbulu (feathered) di crop kanonik: menutupi wajah + sedikit rambut/telinga."""
    face = size / (1 + 2 * margin)  # sisi kotak wajah asli di dalam crop
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) + 0.5
    c = size / 2
    rx, ry = 0.5 * face * 1.30, 0.5 * face * 1.55
    d = ((xx - c) / rx) ** 2 + ((yy - c * 0.97) / ry) ** 2
    m = (d <= 1).astype(np.float32)
    k = max(3, int(size * 0.08) | 1)
    m = cv2.GaussianBlur(m, (k, k), 0)
    return np.clip(m * 1.4, 0, 1)


def paste_delta_affine(acc: np.ndarray, delta_c: np.ndarray, T: np.ndarray) -> None:
    """Tambahkan delta kanonik ke frame lewat transformasi similarity T (2x3, crop -> frame)."""
    S = delta_c.shape[0]
    h, w = acc.shape[:2]
    corners = np.array([[0, 0], [S, 0], [0, S], [S, S]], np.float32)
    pts = corners @ T[:, :2].T + T[:, 2]
    x0, y0 = np.maximum(np.floor(pts.min(0)).astype(int), 0)
    x1, y1 = np.minimum(np.ceil(pts.max(0)).astype(int), [w, h])
    if x1 <= x0 or y1 <= y0:
        return
    T2 = T.astype(np.float32).copy()
    T2[:, 2] -= [x0, y0]
    acc[y0:y1, x0:x1] += cv2.warpAffine(delta_c, T2, (int(x1 - x0), int(y1 - y0)), flags=cv2.INTER_LINEAR,
                                        borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def crop_coords(pts: np.ndarray, box, size: int) -> np.ndarray:
    """Koordinat frame -> koordinat crop kanonik (size x size) untuk kotak `box`."""
    x0, y0, side = _square_region(box)
    return (pts - np.array([x0, y0], np.float32)) * (size / side)


def smooth_kps(kps: dict) -> dict:
    """Rata-rata bergerak 3 frame pada landmark (mengurangi getar deteksi +-1 px)."""
    out = {}
    for f, k in kps.items():
        near = [kps[g] for g in (f - 1, f, f + 1) if g in kps]
        out[f] = np.mean(near, 0).astype(np.float32)
    return out


def _square_region(box: tuple[float, float, float]) -> tuple[int, int, int]:
    cx, cy, s = box
    side = max(8, int(round(s)))
    return int(round(cx - side / 2)), int(round(cy - side / 2)), side


def extract_crop(frame: np.ndarray, box, size: int) -> np.ndarray:
    """Crop persegi (dengan padding tepi jika keluar frame), diubah ke size x size."""
    x0, y0, side = _square_region(box)
    h, w = frame.shape[:2]
    pad = [max(0, -y0), max(0, y0 + side - h), max(0, -x0), max(0, x0 + side - w)]
    crop = frame[max(0, y0): min(h, y0 + side), max(0, x0): min(w, x0 + side)]
    if any(pad):
        crop = cv2.copyMakeBorder(crop, *pad, cv2.BORDER_REPLICATE)
    interp = cv2.INTER_AREA if side > size else cv2.INTER_LINEAR
    return cv2.resize(crop, (size, size), interpolation=interp)


def paste_delta(acc: np.ndarray, delta_c: np.ndarray, box) -> None:
    """Tambahkan delta kanonik (S, S, 3) ke akumulator frame (H, W, 3) float32 pada kotak `box`."""
    x0, y0, side = _square_region(box)
    h, w = acc.shape[:2]
    d = cv2.resize(delta_c, (side, side), interpolation=cv2.INTER_LINEAR)
    ys, xs = max(0, y0), max(0, x0)
    ye, xe = min(h, y0 + side), min(w, x0 + side)
    if ye <= ys or xe <= xs:
        return
    acc[ys:ye, xs:xe] += d[ys - y0: ye - y0, xs - x0: xe - x0]


def _thumb(frame: np.ndarray) -> np.ndarray:
    return cv2.resize(cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY), (64, 36), interpolation=cv2.INTER_AREA).astype(np.float32) / 255


def _tqdm(**kw):
    from tqdm.auto import tqdm

    return tqdm(dynamic_ncols=True, **kw)


@dataclass
class TrackPlan:
    track: Track
    size: int
    keys: list[int]
    crops: dict[int, np.ndarray] = field(default_factory=dict)
    key_kps: dict[int, np.ndarray] = field(default_factory=dict)  # landmark keyframe dalam koordinat crop
    deltas: dict[int, np.ndarray] = field(default_factory=dict)  # frame -> (S, S, 3) float32, sudah dimask
    final_loss: list[float] = field(default_factory=list)
    final_id: list[float] = field(default_factory=list)


def plan_tracks(tracks: Sequence[Track], interval: int, crop_min: int, crop_max: int) -> list[TrackPlan]:
    plans = []
    for t in tracks:
        frames = t.frames
        sides = [t.boxes[f][2] for f in frames]
        size = int(np.clip(np.median(sides), crop_min, crop_max)) // 8 * 8
        keys = frames[::interval]
        if keys[-1] != frames[-1]:
            keys.append(frames[-1])
        plans.append(TrackPlan(t, size, keys))
    return plans


def _key_weights(plan: TrackPlan, f: int) -> list[tuple[int, float]]:
    """Keyframe yang dipakai frame f beserta bobot interpolasinya."""
    keys = plan.keys
    if f not in plan.track.boxes:
        return []
    j = bisect.bisect_right(keys, f) - 1
    if j < 0:
        return [(keys[0], 1.0)]
    k0 = keys[j]
    if k0 == f or j + 1 >= len(keys):
        return [(k0, 1.0)]
    k1 = keys[j + 1]
    a = (f - k0) / (k1 - k0)
    return [(k0, 1 - a), (k1, a)]


def _delta_at(plan: TrackPlan, f: int) -> np.ndarray | None:
    """Delta kanonik untuk frame f: interpolasi linear antar dua keyframe terdekat."""
    keys = plan.keys
    if f not in plan.track.boxes:
        return None
    j = bisect.bisect_right(keys, f) - 1
    if j < 0:
        return plan.deltas[keys[0]]
    k0 = keys[j]
    if k0 == f or j + 1 >= len(keys):
        return plan.deltas[k0]
    k1 = keys[j + 1]
    a = (f - k0) / (k1 - k0)
    return (1 - a) * plan.deltas[k0] + a * plan.deltas[k1]


def protect_video(
    input_path: str | Path,
    output_path: str | Path | None = None,
    config: VideoProtectConfig | None = None,
    *,
    vae_ids: Sequence[str] = (DEFAULT_VAE,),
    vaes: Sequence | None = None,
    device: str | None = None,
    detector=None,
    keep_audio: bool = False,
    show_progress: bool = True,
) -> dict:
    """Lindungi satu video. Mengembalikan laporan (juga ditulis ke manifest JSON)."""
    cfg = config or VideoProtectConfig()
    input_path = Path(input_path)
    output_path = Path(output_path) if output_path else input_path.with_name(f"{input_path.stem}_protected.mp4")
    if output_path.suffix.lower() != ".mp4":
        output_path = output_path.with_suffix(".mp4")
    dev = pick_device(device)
    torch.manual_seed(cfg.seed)
    timings: dict[str, float] = {}
    info = probe(input_path)
    warnings = []
    if info.is_hdr:
        warnings.append("Video HDR (HLG/PQ) dikonversi ke SDR 8-bit; warna bisa sedikit berbeda dari aslinya.")
    est = info.n_frames or None

    # ---------- 1. deteksi & tracking ----------
    t0 = time.time()
    det = detector or FaceDetector(cfg.detector, cfg.detect_size)
    tracker = FaceTracker(margin=cfg.margin, max_faces=cfg.max_faces)
    prev_thumb, cuts, n_frames = None, [], 0
    bar = _tqdm(total=est, desc="1/4 deteksi wajah", unit="frame", disable=not show_progress)
    for i, frame in enumerate(iter_frames(input_path, info)):
        th = _thumb(frame)
        if prev_thumb is not None and float(np.abs(th - prev_thumb).mean()) > cfg.scene_cut:
            tracker.cut()
            cuts.append(i)
        prev_thumb = th
        tracker.update(i, det.detect(frame))
        n_frames = i + 1
        bar.update(1)
    bar.close()
    tracks = tracker.tracks()
    for t in tracks:
        t.kps = smooth_kps(t.kps)
    pcfg = cfg.protect_config()
    plans = plan_tracks(tracks, cfg.interval(), cfg.crop_min, cfg.crop_max)
    timings["detect_s"] = time.time() - t0

    # ---------- 2. ambil crop keyframe ----------
    t0 = time.time()
    key_index: dict[int, list[TrackPlan]] = {}
    for p in plans:
        for k in p.keys:
            key_index.setdefault(k, []).append(p)
    n_keys = sum(len(p.keys) for p in plans)
    if n_keys:
        bar = _tqdm(total=n_frames, desc="2/4 ambil keyframe", unit="frame", disable=not show_progress)
        for i, frame in enumerate(iter_frames(input_path, info)):
            for p in key_index.get(i, []):
                p.crops[i] = extract_crop(frame, p.track.boxes[i], p.size)
                if i in p.track.kps:
                    p.key_kps[i] = crop_coords(p.track.kps[i], p.track.boxes[i], p.size)
            bar.update(1)
            if i >= max(key_index):
                bar.update(n_frames - i - 1)
                break
        bar.close()
    timings["keyframes_s"] = time.time() - t0

    # ---------- 3. optimasi perturbasi (GPU, batch) ----------
    t0 = time.time()
    if n_keys:
        models = list(vaes) if vaes is not None else _load_vaes(vae_ids, dev)
        arc = None
        if cfg.identity == "on" or (cfg.identity == "auto" and identity_available()):
            from .identity_attack import ArcFaceTorch

            arc = ArcFaceTorch(dev)
        elif cfg.identity == "auto":
            warnings.append("insightface/onnx2torch tidak terpasang: serangan identitas (anti face-swap) DIMATIKAN.")
        if arc is not None:
            pcfg = replace(pcfg, identity_weight=cfg.identity_weight)
        n_chunks = sum(math.ceil(len(p.keys) / cfg.batch_size) for p in plans)
        bar = _tqdm(total=n_chunks * pcfg.steps, desc="3/4 optimasi perlindungan", unit="step",
                    disable=not show_progress)
        for p in plans:
            attack = EncoderAttack(models, replace(pcfg, work_size=p.size), dev)
            mask = torch.from_numpy(canonical_mask(p.size, cfg.margin))[None, None]
            shared = None
            for c in range(0, len(p.keys), cfg.batch_size):
                keys = p.keys[c: c + cfg.batch_size]
                x = torch.cat([to_tensor(p.crops[k]) for k in keys])

                def prog(i, n, loss, _bar=bar):
                    _bar.update(1)
                    _bar.set_postfix(track=p.track.id, loss=f"{loss:.3f}")

                idp = arc.prepare([p.crops[k] for k in keys]) if arc is not None else None
                r = attack.attack_batch(
                    x, mask, shared=cfg.temporal, residual_ratio=cfg.residual_ratio,
                    init_shared=shared if cfg.temporal else None, identity=idp, progress=prog,
                )
                shared = r["shared"]
                d = r["delta"].detach().cpu().permute(0, 2, 3, 1).numpy().astype(np.float32)
                for k, dk in zip(keys, d):
                    p.deltas[k] = dk
                p.final_loss += r["final_loss"].tolist()
                if r["final_identity_cos"] is not None:
                    v = idp["valid"].cpu().bool()
                    p.final_id += r["final_identity_cos"][v].tolist()
            p.crops.clear()  # bebaskan memori
        bar.close()
    timings["optimize_s"] = time.time() - t0

    # ---------- 4. terapkan & tulis video ----------
    t0 = time.time()
    tmp = Path(tempfile.mkdtemp(prefix="antideepfake_"))
    audio_path = None
    try:
        audio_path = extract_audio(input_path, tmp) if info.has_audio else None
        bar = _tqdm(total=n_frames, desc="4/4 tulis video", unit="frame", disable=not show_progress)
        written = n_aligned = n_box = 0
        with VideoWriter(output_path, info.width, info.height, info.fps, audio=audio_path,
                         audio_codec=info.audio_codec, crf=cfg.crf, preset=cfg.x264_preset) as wr:
            for i, frame in enumerate(iter_frames(input_path, info)):
                active = [(p, _key_weights(p, i)) for p in plans]
                active = [(p, kw) for p, kw in active if kw]
                if active:
                    acc = np.zeros(frame.shape, np.float32)
                    for p, kw in active:
                        for k, wgt in kw:
                            # Propagasi berbasis landmark: perturbasi keyframe di-warp mengikuti
                            # 5 titik wajah di frame ini (menempel tepat pada mata/hidung/mulut).
                            # Tanpa landmark: ikuti kotak wajah yang dihaluskan.
                            T = None
                            if k in p.key_kps and i in p.track.kps:
                                T, _ = cv2.estimateAffinePartial2D(p.key_kps[k], p.track.kps[i], method=cv2.LMEDS)
                            if T is not None:
                                paste_delta_affine(acc, wgt * p.deltas[k], T)
                                n_aligned += 1
                            else:
                                paste_delta(acc, wgt * p.deltas[k], p.track.boxes[i])
                                n_box += 1
                    # klem ke batas eps (adaptif tekstur) milik frame INI, lalu bulatkan
                    eps_map = texture_eps_map(to_tensor(frame), pcfg.eps, pcfg.flat_ratio) if pcfg.adaptive_eps \
                        else torch.full((1, 1, *frame.shape[:2]), pcfg.eps)
                    e = eps_map[0, 0].numpy()[..., None] * 255
                    acc = np.clip(acc * 255, -e, e)
                    frame = np.clip(np.round(frame.astype(np.float32) + acc), 0, 255).astype(np.uint8)
                if cfg.watermark:
                    frame = embed_watermark(frame, cfg.owner)
                wr.write(frame)
                written += 1
                bar.update(1)
        bar.close()
        if written != n_frames:
            warnings.append(f"Jumlah frame berbeda antara lintasan ({n_frames} vs {written}).")
        kept_audio = None
        if keep_audio and audio_path:
            kept_audio = output_path.with_name(f"{output_path.stem}_audio.mka")
            shutil.copy(audio_path, kept_audio)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    timings["write_s"] = time.time() - t0

    out_info = probe(output_path)
    report = {
        "input": {"width": info.width, "height": info.height, "fps": info.fps_str, "frames": n_frames,
                  "duration_s": round(info.duration, 3), "has_audio": info.has_audio, "codec": info.codec},
        "output": {"width": out_info.width, "height": out_info.height, "fps": out_info.fps_str,
                   "frames": written, "duration_s": round(out_info.duration, 3), "has_audio": out_info.has_audio},
        "scene_cuts": cuts,
        "tracks": [{"id": p.track.id, "first_frame": p.track.frames[0], "last_frame": p.track.frames[-1],
                    "frames": len(p.track.boxes), "keyframes": len(p.keys), "crop_size": p.size,
                    "final_latent_loss_mean": round(float(np.mean(p.final_loss)), 4) if p.final_loss else None,
                    "final_identity_cos_mean": round(float(np.mean(p.final_id)), 4) if p.final_id else None}
                   for p in plans],
        "frames_with_faces": len(set().union(*[p.track.boxes.keys() for p in plans])) if plans else 0,
        "keyframes_total": n_keys,
        "propagation": {"landmark_aligned": n_aligned, "box_only": n_box},
        "device": str(dev),
        "timings_s": {k: round(v, 1) for k, v in timings.items()},
        "config": {**asdict(cfg), "protect": asdict(pcfg)},
        "warnings": warnings,
        "audio_file": str(kept_audio) if kept_audio else None,
    }
    manifest = output_path.with_suffix(".json")
    write_manifest(manifest, input_path, output_path, cfg.owner, report)
    report["output_path"] = str(output_path)
    report["manifest"] = str(manifest)
    return report


def _load_vaes(vae_ids: Sequence[str], dev: torch.device):
    from .pipeline import get_vaes

    return get_vaes(vae_ids, dev)
