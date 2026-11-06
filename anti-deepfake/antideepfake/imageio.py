"""Baca/tulis gambar dan konversi numpy <-> tensor."""

from __future__ import annotations

import io
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageOps


def load_rgb(path: str | Path) -> np.ndarray:
    """Baca gambar sebagai array uint8 RGB (H, W, 3), orientasi EXIF dirapikan."""
    img = Image.open(path)
    img = ImageOps.exif_transpose(img).convert("RGB")
    return np.asarray(img, dtype=np.uint8).copy()


def save_rgb(image: np.ndarray, path: str | Path, quality: int = 95) -> None:
    """Simpan array uint8 RGB. Gunakan PNG (lossless) untuk hasil perlindungan."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.fromarray(image)
    if path.suffix.lower() in {".jpg", ".jpeg"}:
        img.save(path, quality=quality, subsampling=0)
    else:
        img.save(path)


def to_tensor(image: np.ndarray, device: torch.device | str = "cpu") -> torch.Tensor:
    """uint8 (H, W, 3) -> float tensor (1, 3, H, W) dalam rentang [0, 1]."""
    t = torch.from_numpy(np.array(image, copy=True)).permute(2, 0, 1).float().div(255.0)
    return t.unsqueeze(0).to(device)


def to_uint8(tensor: torch.Tensor) -> np.ndarray:
    """float tensor (1, 3, H, W) [0, 1] -> uint8 (H, W, 3), dibulatkan."""
    t = tensor.detach().clamp(0, 1)[0].permute(1, 2, 0).cpu().numpy()
    return np.round(t * 255.0).astype(np.uint8)


def jpeg_roundtrip(image: np.ndarray, quality: int) -> np.ndarray:
    """Simulasikan kompresi JPEG (seperti saat diupload ke media sosial)."""
    buf = io.BytesIO()
    Image.fromarray(image).save(buf, format="JPEG", quality=int(quality))
    buf.seek(0)
    return np.asarray(Image.open(buf).convert("RGB"), dtype=np.uint8).copy()


def resize_rgb(image: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    """Resize ke (lebar, tinggi) dengan Lanczos."""
    return np.asarray(Image.fromarray(image).resize(size, Image.LANCZOS), dtype=np.uint8)


def fit_size(width: int, height: int, longest: int, multiple: int = 8) -> tuple[int, int]:
    """Ukuran (lebar, tinggi) dengan sisi terpanjang = `longest`, kelipatan `multiple`."""
    scale = longest / max(width, height)
    w = max(multiple, int(round(width * scale / multiple)) * multiple)
    h = max(multiple, int(round(height * scale / multiple)) * multiple)
    return w, h
