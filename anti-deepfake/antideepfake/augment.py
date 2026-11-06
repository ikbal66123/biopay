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


def chroma_subsample(x: torch.Tensor) -> torch.Tensor:
    """Simulasi subsampling warna 4:2:0 (dipakai hampir semua video H.264/TikTok).

    Diferensiabel: RGB -> YCbCr, Cb/Cr diperkecil 2x lalu diperbesar, kembali ke RGB.
    Perturbasi pada kanal warna yang halus akan hilang, jadi optimasi belajar
    menaruh lebih banyak "racun" di luminans.
    """
    r, g, b = x[:, 0:1], x[:, 1:2], x[:, 2:3]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cb = (b - y) * 0.564
    cr = (r - y) * 0.713
    h, w = x.shape[-2:]
    cb = F.interpolate(F.avg_pool2d(cb, 2, ceil_mode=True), size=(h, w), mode="bilinear", align_corners=False)
    cr = F.interpolate(F.avg_pool2d(cr, 2, ceil_mode=True), size=(h, w), mode="bilinear", align_corners=False)
    r2 = y + 1.403 * cr
    b2 = y + 1.773 * cb
    g2 = (y - 0.299 * r2 - 0.114 * b2) / 0.587
    return torch.cat([r2, g2, b2], 1)


def h264_roundtrip_np(frames: np.ndarray, crf: int, preset: str = "veryfast") -> np.ndarray:
    """Kompres batch frame uint8 (N, H, W, 3) dengan H.264 sungguhan (FFmpeg), lalu decode."""
    import subprocess

    n, h, w, _ = frames.shape
    pad_h, pad_w = h % 2, w % 2  # yuv420p butuh dimensi genap
    if pad_h or pad_w:
        frames = np.pad(frames, ((0, 0), (0, pad_h), (0, pad_w), (0, 0)), mode="edge")
    H, W = frames.shape[1:3]
    enc = subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", "30", "-i", "-",
         "-c:v", "libx264", "-preset", preset, "-crf", str(int(crf)), "-pix_fmt", "yuv420p", "-f", "h264", "-"],
        input=np.ascontiguousarray(frames).tobytes(), capture_output=True, check=True,
    ).stdout
    dec = subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "h264", "-i", "-", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        input=enc, capture_output=True, check=True,
    ).stdout
    out = np.frombuffer(dec, dtype=np.uint8).reshape(-1, H, W, 3)[:n]
    return out[:, :h, :w].copy()


def h264_ste(x: torch.Tensor, crf: int) -> torch.Tensor:
    """H.264 sungguhan di forward, gradien identitas di backward (seperti jpeg_ste)."""
    arr = np.round(x.detach().clamp(0, 1).permute(0, 2, 3, 1).cpu().numpy() * 255).astype(np.uint8)
    dec = h264_roundtrip_np(arr, crf)
    y = torch.from_numpy(dec.astype(np.float32) / 255.0).permute(0, 3, 1, 2).to(x.device, x.dtype)
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
        chroma_prob: float = 0.0,
        h264_prob: float = 0.0,
        h264_crf: tuple[int, int] = (23, 32),
        seed: int = 0,
    ) -> None:
        self.work_hw = work_hw
        self.resize_range = resize_range
        self.jpeg_prob = jpeg_prob
        self.jpeg_quality = jpeg_quality
        self.blur_prob = blur_prob
        self.noise_std = noise_std
        self.chroma_prob = chroma_prob
        self.h264_prob = h264_prob
        self.h264_crf = h264_crf
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
        if self.chroma_prob > 0 and self.rng.random() < self.chroma_prob:
            x = chroma_subsample(x)
        x = x.clamp(0, 1)
        # H.264 dan JPEG saling eksklusif dalam satu sampel (keduanya kompresi akhir).
        if self.h264_prob > 0 and self.rng.random() < self.h264_prob:
            x = h264_ste(x, self.rng.randint(*self.h264_crf))
        elif self.jpeg_prob > 0 and self.rng.random() < self.jpeg_prob:
            x = jpeg_ste(x, self.rng.randint(*self.jpeg_quality))
        return x
