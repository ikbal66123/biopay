"""Transformasi acak untuk Expectation over Transformation (EOT).

Saat optimasi, perturbasi dilewatkan ke transformasi yang mirip dengan yang
terjadi di dunia nyata (resize, kompresi JPEG, blur, noise). Tujuannya agar
perlindungan tidak langsung hilang ketika foto diresize/dikompres platform.
"""

from __future__ import annotations

import io
import random

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image


def resize(x: torch.Tensor, size: tuple[int, int]) -> torch.Tensor:
    """Resize diferensiabel. `size` = (tinggi, lebar)."""
    if tuple(x.shape[-2:]) == tuple(size):
        return x
    return F.interpolate(x, size=size, mode="bilinear", align_corners=False, antialias=True)


def jpeg_ste(x: torch.Tensor, quality: int) -> torch.Tensor:
    """Kompresi JPEG sungguhan di forward pass, gradien identitas di backward.

    Ini trik "straight-through estimator" (BPDA): JPEG tidak diferensiabel, jadi
    gradien dilewatkan apa adanya. Cukup efektif agar perturbasi tahan JPEG.
    """
    out = []
    for img in x.detach().clamp(0, 1):
        arr = np.round(img.permute(1, 2, 0).cpu().numpy() * 255).astype(np.uint8)
        buf = io.BytesIO()
        Image.fromarray(arr).save(buf, format="JPEG", quality=int(quality))
        buf.seek(0)
        dec = np.asarray(Image.open(buf).convert("RGB"), dtype=np.float32) / 255.0
        out.append(torch.from_numpy(dec).permute(2, 0, 1))
    y = torch.stack(out).to(x.device, x.dtype)
    return x + (y - x).detach()


def gaussian_blur(x: torch.Tensor, sigma: float) -> torch.Tensor:
    radius = max(1, int(round(2 * sigma)))
    coords = torch.arange(-radius, radius + 1, device=x.device, dtype=x.dtype)
    k1 = torch.exp(-(coords**2) / (2 * sigma**2))
    k1 = k1 / k1.sum()
    c = x.shape[1]
    kx = k1.view(1, 1, 1, -1).repeat(c, 1, 1, 1)
    ky = k1.view(1, 1, -1, 1).repeat(c, 1, 1, 1)
    x = F.pad(x, (radius, radius, radius, radius), mode="reflect")
    x = F.conv2d(x, kx, groups=c)
    return F.conv2d(x, ky, groups=c)


class EOTSampler:
    """Mengambil sampel transformasi acak. Semua parameter bisa dimatikan."""

    def __init__(
        self,
        work_hw: tuple[int, int],
        resize_range: tuple[float, float] = (0.75, 1.0),
        jpeg_prob: float = 0.5,
        jpeg_quality: tuple[int, int] = (50, 95),
        blur_prob: float = 0.2,
        noise_std: float = 0.01,
        seed: int = 0,
    ) -> None:
        self.work_hw = work_hw
        self.resize_range = resize_range
        self.jpeg_prob = jpeg_prob
        self.jpeg_quality = jpeg_quality
        self.blur_prob = blur_prob
        self.noise_std = noise_std
        self.rng = random.Random(seed)

    def sample_size(self) -> tuple[int, int]:
        s = self.rng.uniform(*self.resize_range)
        h, w = self.work_hw
        # VAE butuh kelipatan 8
        return max(8, int(h * s) // 8 * 8), max(8, int(w * s) // 8 * 8)

    def photometric(self, x: torch.Tensor) -> torch.Tensor:
        """Transformasi non-geometris (hanya untuk gambar yang dilindungi)."""
        if self.blur_prob > 0 and self.rng.random() < self.blur_prob:
            x = gaussian_blur(x, self.rng.uniform(0.3, 1.0))
        if self.noise_std > 0:
            x = x + torch.randn_like(x) * self.rng.uniform(0, self.noise_std)
        x = x.clamp(0, 1)
        if self.jpeg_prob > 0 and self.rng.random() < self.jpeg_prob:
            x = jpeg_ste(x, self.rng.randint(*self.jpeg_quality))
        return x
