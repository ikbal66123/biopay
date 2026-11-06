"""Metrik kemiripan visual.

PSNR (dB): makin tinggi makin mirip. > 35 dB umumnya sulit dibedakan mata,
           > 40 dB praktis identik.
SSIM     : 0..1, makin dekat 1 makin mirip struktur. > 0.95 umumnya tak terlihat.
LPIPS    : opsional (pip install lpips), jarak perseptual; < 0.05 sangat mirip.
"""

from __future__ import annotations

import numpy as np


def psnr(a: np.ndarray, b: np.ndarray) -> float:
    mse = np.mean((a.astype(np.float64) - b.astype(np.float64)) ** 2)
    if mse == 0:
        return float("inf")
    return float(10 * np.log10(255.0**2 / mse))


def ssim(a: np.ndarray, b: np.ndarray) -> float:
    from skimage.metrics import structural_similarity

    return float(structural_similarity(a, b, channel_axis=2, data_range=255))


def linf(a: np.ndarray, b: np.ndarray) -> int:
    return int(np.abs(a.astype(np.int16) - b.astype(np.int16)).max())


_lpips_model = None


def lpips_distance(a: np.ndarray, b: np.ndarray) -> float | None:
    """LPIPS jika paket `lpips` terpasang, selain itu None."""
    global _lpips_model
    try:
        import lpips
        import torch
    except ImportError:
        return None
    if _lpips_model is None:
        _lpips_model = lpips.LPIPS(net="alex", verbose=False).eval()

    def t(x):
        return torch.from_numpy(x).permute(2, 0, 1)[None].float() / 127.5 - 1

    with torch.no_grad():
        return float(_lpips_model(t(a), t(b)).item())


def similarity_report(original: np.ndarray, other: np.ndarray, with_lpips: bool = False) -> dict:
    rep = {"psnr_db": round(psnr(original, other), 2), "ssim": round(ssim(original, other), 4), "linf_0_255": linf(original, other)}
    if with_lpips:
        d = lpips_distance(original, other)
        if d is not None:
            rep["lpips"] = round(d, 4)
    return rep
