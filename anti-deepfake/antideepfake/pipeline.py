"""Alur lengkap "satu klik": foto masuk -> foto terlindungi + watermark + manifest.

Dipakai oleh script CLI sekarang, dan nanti oleh backend FastAPI (Tahap 4).
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Callable, Sequence

import torch

import numpy as np

from .device import pick_device
from .faces import detect_faces, face_mask
from .identity_attack import available as identity_available
from .imageio import load_rgb, save_rgb
from .manifest import write_manifest
from .metrics import similarity_report
from .photoguard import DEFAULT_VAE, EncoderAttack, load_vae, make_config
from .watermark import detect_layers, embed_layers

_VAE_CACHE: dict = {}
_EMB_CACHE: dict = {}

# EOT untuk foto (poin "perkuat EOT"): penyerang/platform biasanya me-resize ke 512-1024 px,
# mengompres JPEG 60-90, memotong sedikit, dan mengubah warna sedikit.
PHOTO_EOT = dict(work_size=1024, resize_range=(0.5, 1.0), jpeg_prob=0.5, jpeg_quality=(60, 90),
                 crop_frac=0.05, color=0.05, blur_prob=0.2, noise_std=0.01)

# Ensemble default di GPU. Di CPU hanya VAE pertama (ensemble terlalu lambat).
ENSEMBLE_VAES = ("stabilityai/sd-vae-ft-mse", "madebyollin/sdxl-vae-fp16-fix")
ENSEMBLE_EMBEDDERS = ("openclip:ViT-L-14:openai", "openclip:ViT-B-16-SigLIP:webli")


def get_vaes(vae_ids: Sequence[str], device: torch.device, fp16: bool = False, strict: bool = True):
    """Muat VAE (di-cache). strict=False: VAE yang gagal diunduh dilewati dengan peringatan."""
    dtype = torch.float16 if fp16 and device.type == "cuda" else torch.float32
    out = []
    for vid in vae_ids:
        key = (vid, str(device), dtype)
        if key not in _VAE_CACHE:
            try:
                _VAE_CACHE[key] = load_vae(vid, device, dtype)
            except Exception as e:  # noqa: BLE001
                if strict:
                    raise
                print(f"[!] VAE {vid} dilewati: {type(e).__name__}: {e}")
                continue
        out.append(_VAE_CACHE[key])
    return out


def get_embedders(specs: Sequence[str], device: torch.device, strict: bool = True):
    from .embedders import load_embedder

    out = []
    for spec in specs:
        key = (spec, str(device))
        if key not in _EMB_CACHE:
            try:
                _EMB_CACHE[key] = load_embedder(spec, device)
            except Exception as e:  # noqa: BLE001
                if strict:
                    raise
                print(f"[!] Encoder {spec} dilewati: {type(e).__name__}: {e}")
                continue
        out.append(_EMB_CACHE[key])
    return out


def fit_ssim(image: np.ndarray, delta: np.ndarray, target: float, post=None, max_side: int = 1536):
    """Skala perturbasi terbesar (<= 1) yang menjaga SSIM(asli, hasil) >= target.

    `post` (mis. penyisipan watermark) ikut dihitung. SSIM dihitung pada versi yang diperkecil
    ke `max_side` agar cepat. Mengembalikan (gambar_hasil, skala, ssim).
    """
    import cv2

    from .metrics import ssim

    def make(sc):
        out = np.clip(np.round(image.astype(np.float32) + delta * sc), 0, 255).astype(np.uint8)
        return post(out) if post else out

    def score(img):
        h, w = image.shape[:2]
        f = min(1.0, max_side / max(h, w))
        if f < 1:
            size = (round(w * f), round(h * f))
            return ssim(cv2.resize(image, size, interpolation=cv2.INTER_AREA), cv2.resize(img, size, interpolation=cv2.INTER_AREA))
        return ssim(image, img)

    out = make(1.0)
    s = score(out)
    if s >= target:
        return out, 1.0, s
    lo, hi, best = 0.0, 1.0, (make(0.0), 0.0, score(make(0.0)))
    for _ in range(7):
        mid = (lo + hi) / 2
        o = make(mid)
        sm = score(o)
        if sm >= target:
            lo, best = mid, (o, mid, sm)
        else:
            hi = mid
    return best


def default_output_path(input_path: str | Path) -> Path:
    p = Path(input_path)
    return p.with_name(f"{p.stem}_protected.png")


def protect_photo_file(
    input_path: str | Path,
    output_path: str | Path | None = None,
    *,
    preset: str = "balanced",
    owner: str = "anonymous",
    face_only: bool = False,
    watermark: bool = True,
    vae_ids: Sequence[str] = (DEFAULT_VAE,),
    vaes: Sequence | None = None,
    device: str | None = None,
    fp16: bool = False,
    config_overrides: dict | None = None,
    progress: Callable[[int, int, float], None] | None = None,
    identity: str = "auto",
    identity_weight: float = 1.0,
    embedder_specs: Sequence[str] = (),
    embedders: Sequence | None = None,
    strong_eot: bool = True,
    ssim_target: float | None = 0.95,
    watermark2: str | None = None,
) -> dict:
    """Lindungi satu file foto. Mengembalikan laporan (juga ditulis ke manifest JSON)."""
    input_path = Path(input_path)
    output_path = Path(output_path) if output_path else default_output_path(input_path)
    if output_path.suffix.lower() in {".jpg", ".jpeg"}:
        # JPEG akan merusak sebagian perlindungan sebelum foto sempat diupload.
        output_path = output_path.with_suffix(".png")

    dev = pick_device(device)
    image = load_rgb(input_path)
    boxes = detect_faces(image)

    mask = None
    if face_only:
        if boxes:
            mask = face_mask(image.shape[:2], boxes)
        else:
            print("[!] Tidak ada wajah terdeteksi, perlindungan diterapkan ke seluruh foto.")

    overrides = {**(PHOTO_EOT if strong_eot else {}), **(config_overrides or {})}
    cfg = make_config(preset, **overrides)
    models = list(vaes) if vaes is not None else get_vaes(vae_ids, dev, fp16, strict=False)
    if not models:
        raise RuntimeError("Tidak ada VAE yang berhasil dimuat.")
    embs = list(embedders) if embedders is not None else get_embedders(embedder_specs, dev, strict=False)

    # Serangan identitas ArcFace (anti face-swap), lihat identity_attack.py
    arc, id_note = None, None
    if identity == "on" or (identity == "auto" and identity_available()):
        from .identity_attack import ArcFaceTorch

        arc = ArcFaceTorch(dev)
        cfg = replace(cfg, identity_weight=identity_weight)
    elif identity == "auto":
        id_note = "insightface/onnx2torch tidak terpasang: anti face-swap dimatikan"

    attack = EncoderAttack(models, cfg, dev)
    try:
        result = attack.protect(image, mask=mask, progress=progress, identity_model=arc, embedders=embs)
    except torch.cuda.OutOfMemoryError:
        # GPU kecil (mis. T4) + ensemble besar: ulangi di ukuran kerja lebih kecil
        torch.cuda.empty_cache()
        print("[!] Memori GPU tidak cukup, mengulang dengan ukuran kerja 512 px")
        attack.config = replace(cfg, work_size=512, resize_range=(0.75, 1.0), opt_max_side=768)
        result = attack.protect(image, mask=mask, progress=progress, identity_model=arc, embedders=embs)
    if arc is not None and result.final_identity_cos is None:
        id_note = "tidak ada wajah terdeteksi untuk serangan identitas"

    post = (lambda im: embed_layers(im, owner, watermark2)) if watermark else None
    if ssim_target:
        protected, strength, ssim_val = fit_ssim(image, result.delta, ssim_target, post)
    else:
        protected, strength = (post(result.image) if post else result.image), 1.0
    wm_info = detect_layers(protected, owner, watermark2) if watermark else None

    save_rgb(protected, output_path)
    report = {
        "faces_detected": len(boxes),
        "face_boxes": boxes,
        "face_only": face_only and bool(boxes),
        "preset": preset,
        "vae_models": list(vae_ids) if vaes is None else ["<custom>"],
        "device": str(dev),
        "attack": result.summary(),
        "imperceptibility": similarity_report(image, protected),
        "watermark": wm_info,
        "identity_attack": {"enabled": result.final_identity_cos is not None, "note": id_note},
        "embedders": [e.name for e in embs],
        "strength_after_ssim_guard": round(strength, 3),
    }
    manifest_path = output_path.with_suffix(".json")
    write_manifest(manifest_path, input_path, output_path, owner, report)
    report["output"] = str(output_path)
    report["manifest"] = str(manifest_path)
    return report
