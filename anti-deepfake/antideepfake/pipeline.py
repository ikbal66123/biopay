"""Alur lengkap "satu klik": foto masuk -> foto terlindungi + watermark + manifest.

Dipakai oleh script CLI sekarang, dan nanti oleh backend FastAPI (Tahap 4).
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Callable, Sequence

import torch

from .device import pick_device
from .faces import detect_faces, face_mask
from .identity_attack import available as identity_available
from .imageio import load_rgb, save_rgb
from .manifest import write_manifest
from .metrics import similarity_report
from .photoguard import DEFAULT_VAE, EncoderAttack, load_vae, make_config
from .watermark import detect_watermark, embed_watermark

_VAE_CACHE: dict = {}


def get_vaes(vae_ids: Sequence[str], device: torch.device, fp16: bool = False):
    dtype = torch.float16 if fp16 and device.type == "cuda" else torch.float32
    out = []
    for vid in vae_ids:
        key = (vid, str(device), dtype)
        if key not in _VAE_CACHE:
            _VAE_CACHE[key] = load_vae(vid, device, dtype)
        out.append(_VAE_CACHE[key])
    return out


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

    cfg = make_config(preset, **(config_overrides or {}))
    models = list(vaes) if vaes is not None else get_vaes(vae_ids, dev, fp16)

    # Serangan identitas ArcFace (anti face-swap), lihat identity_attack.py
    idp, id_note = None, None
    if identity == "on" or (identity == "auto" and identity_available()):
        from .identity_attack import ArcFaceTorch

        idp = ArcFaceTorch(dev).prepare([image])
        if idp is None:
            id_note = "tidak ada wajah untuk serangan identitas"
        else:
            cfg = replace(cfg, identity_weight=identity_weight)
    elif identity == "auto":
        id_note = "insightface/onnx2torch tidak terpasang: anti face-swap dimatikan"
    result = EncoderAttack(models, cfg, dev).protect(image, mask=mask, progress=progress, identity=idp)
    protected = result.image

    wm_info = None
    if watermark:
        protected = embed_watermark(protected, owner)
        wm_info = detect_watermark(protected, owner)

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
        "identity_attack": {"enabled": idp is not None, "note": id_note},
    }
    manifest_path = output_path.with_suffix(".json")
    write_manifest(manifest_path, input_path, output_path, owner, report)
    report["output"] = str(output_path)
    report["manifest"] = str(manifest_path)
    return report
