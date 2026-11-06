"""Perlindungan foto: serangan encoder ala PhotoGuard pada VAE Stable Diffusion.

Ide dasarnya (Salman et al., 2023, "Raising the Cost of Malicious AI-Powered
Image Editing"): hampir semua editor berbasis Stable Diffusion (img2img,
inpainting, banyak pipeline face-swap/"AI edit") pertama-tama mengubah foto
menjadi *latent* lewat encoder VAE. Kita mencari perturbasi kecil `delta`
(|delta| <= eps per piksel, tak terlihat mata) sehingga encoder memetakan foto
kita ke latent milik gambar target yang tidak berguna (abu-abu / pola acak).
Akibatnya model "melihat" gambar target, bukan wajah kita, dan hasil editnya
rusak atau tidak mirip.

Optimasi memakai PGD (Projected Gradient Descent) dengan norma L-infinity,
ditambah EOT (resize, JPEG, blur, noise acak) supaya lebih tahan kompresi.
"""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field, replace
from typing import Callable, Sequence

import numpy as np
import torch
import torch.nn.functional as F

from .augment import EOTSampler, resize
from .imageio import fit_size, to_tensor, to_uint8

DEFAULT_VAE = "stabilityai/sd-vae-ft-mse"


@dataclass
class ProtectConfig:
    eps: float = 8 / 255          # batas perubahan per piksel (L-inf), skala [0, 1]
    step_size: float = 1 / 255    # langkah PGD
    steps: int = 200              # jumlah iterasi PGD
    work_size: int = 512          # sisi terpanjang yang "dilihat" encoder (SD 1.x/2.x memakai 512)
    target: str = "gray"          # "gray" | "noise" | path ke gambar target
    eot: bool = True              # aktifkan transformasi acak (lebih tahan kompresi, sedikit lebih lemah tanpa kompresi)
    eot_samples: int = 1          # sampel transformasi per iterasi (gradien dirata-rata)
    resize_range: tuple[float, float] = (0.75, 1.0)
    jpeg_prob: float = 0.5
    jpeg_quality: tuple[int, int] = (50, 95)
    blur_prob: float = 0.2
    noise_std: float = 0.01
    random_init: bool = True
    adaptive_eps: bool = True     # perubahan lebih kecil di area datar (kulit, langit), penuh di area bertekstur
    flat_ratio: float = 0.35      # eps di area paling datar = flat_ratio * eps
    seed: int = 0


PRESETS: dict[str, dict] = {
    "fast": dict(steps=60, step_size=2 / 255),
    "balanced": dict(steps=200),
    "strong": dict(steps=500, eps=12 / 255, eot_samples=2),
}


def make_config(preset: str = "balanced", **overrides) -> ProtectConfig:
    if preset not in PRESETS:
        raise ValueError(f"Preset tidak dikenal: {preset}. Pilihan: {list(PRESETS)}")
    cfg = replace(ProtectConfig(), **PRESETS[preset])
    overrides = {k: v for k, v in overrides.items() if v is not None}
    return replace(cfg, **overrides)


@dataclass
class ProtectResult:
    image: np.ndarray                 # uint8 RGB terlindungi, ukuran sama dengan input
    config: ProtectConfig
    initial_loss: float               # jarak latent ke target sebelum serangan (relatif = 1.0)
    final_loss: float                 # jarak relatif setelah serangan (makin kecil makin "tertipu")
    linf: float                       # perubahan piksel maksimum (skala 0-255)
    seconds: float
    loss_history: list[float] = field(default_factory=list)

    def summary(self) -> dict:
        return {
            "initial_loss": self.initial_loss,
            "final_loss": self.final_loss,
            "linf_0_255": self.linf,
            "seconds": round(self.seconds, 2),
            "config": asdict(self.config),
        }


def load_vae(model_id: str = DEFAULT_VAE, device: torch.device | str = "cpu", dtype=torch.float32):
    """Muat VAE dari Hugging Face. `model_id` bisa repo VAE atau repo pipeline SD
    (otomatis memakai subfolder `vae`)."""
    from diffusers import AutoencoderKL

    try:
        vae = AutoencoderKL.from_pretrained(model_id, torch_dtype=dtype)
    except (OSError, EnvironmentError):
        vae = AutoencoderKL.from_pretrained(model_id, subfolder="vae", torch_dtype=dtype)
    vae = vae.to(device).eval().requires_grad_(False)
    return vae


def encode(vae, x01: torch.Tensor) -> torch.Tensor:
    """Gambar [0, 1] -> mean latent VAE (deterministik, seperti PhotoGuard)."""
    dtype = next(vae.parameters()).dtype
    return vae.encode((x01 * 2 - 1).to(dtype)).latent_dist.mean.float()


def texture_eps_map(x: torch.Tensor, eps: float, flat_ratio: float, window: int = 7) -> torch.Tensor:
    """Peta eps per piksel (1, 1, H, W) berdasarkan tekstur lokal (masking visual).

    Mata manusia jauh lebih peka terhadap noise di area datar daripada di area
    bertekstur (rambut, kain, dedaunan). Simpangan baku luminans lokal dipakai
    sebagai ukuran tekstur sederhana.
    """
    y = (x * torch.tensor([0.299, 0.587, 0.114], device=x.device).view(1, 3, 1, 1)).sum(1, keepdim=True)
    pad = window // 2
    yp = F.pad(y, (pad, pad, pad, pad), mode="reflect")
    mean = F.avg_pool2d(yp, window, stride=1)
    var = F.avg_pool2d(yp**2, window, stride=1) - mean**2
    texture = (var.clamp_min(0).sqrt() / 0.06).clamp(0, 1)  # std >= ~15/255 dianggap bertekstur penuh
    return eps * (flat_ratio + (1 - flat_ratio) * texture)


def _make_target(kind: str, h: int, w: int, device, seed: int) -> torch.Tensor:
    if kind == "gray":
        return torch.full((1, 3, h, w), 0.5, device=device)
    if kind == "noise":
        # Pola blok acak berwarna: hasil edit cenderung jadi "gambar random".
        g = torch.Generator().manual_seed(seed + 1234)
        small = torch.rand((1, 3, max(1, h // 32), max(1, w // 32)), generator=g)
        return F.interpolate(small, size=(h, w), mode="nearest").to(device)
    from .imageio import load_rgb  # path gambar

    arr = load_rgb(kind)
    t = to_tensor(arr, device)
    return resize(t, (h, w))


class EncoderAttack:
    """Menghasilkan perturbasi tak terlihat terhadap satu atau beberapa encoder VAE.

    Memberi lebih dari satu VAE (ensemble, mis. SD1.5 + SDXL) membuat perlindungan
    lebih mungkin "menular" ke model lain, dengan biaya waktu lebih lama.
    """

    def __init__(self, vaes, config: ProtectConfig | None = None, device: torch.device | str | None = None):
        self.vaes = list(vaes) if isinstance(vaes, (list, tuple)) else [vaes]
        self.config = config or ProtectConfig()
        self.device = torch.device(device) if device is not None else next(self.vaes[0].parameters()).device

    @torch.no_grad()
    def _target_latents(self, target: torch.Tensor, size: tuple[int, int], cache: dict) -> list[torch.Tensor]:
        if size not in cache:
            t = resize(target, size)
            cache[size] = [encode(v, t) for v in self.vaes]
        return cache[size]

    def protect(
        self,
        image: np.ndarray,
        mask: np.ndarray | None = None,
        progress: Callable[[int, int, float], None] | None = None,
    ) -> ProtectResult:
        """Lindungi gambar RGB uint8 (H, W, 3). `mask` opsional (H, W) float 0..1
        membatasi perturbasi (mis. hanya area wajah)."""
        cfg = self.config
        t0 = time.time()
        torch.manual_seed(cfg.seed)
        H, W = image.shape[:2]
        x = to_tensor(image, self.device)
        m = torch.ones((1, 1, H, W), device=self.device)
        if mask is not None:
            m = torch.from_numpy(mask.astype(np.float32))[None, None].to(self.device)

        # Ukuran yang dilihat encoder. Perturbasi tetap hidup di resolusi asli,
        # resize ke ukuran kerja dilakukan di dalam forward (diferensiabel).
        ww, wh = fit_size(W, H, cfg.work_size)
        work_hw = (wh, ww)
        target = _make_target(cfg.target, H, W, self.device, cfg.seed)
        cache: dict = {}

        sampler = EOTSampler(
            work_hw,
            resize_range=cfg.resize_range if cfg.eot else (1.0, 1.0),
            jpeg_prob=cfg.jpeg_prob if cfg.eot else 0.0,
            jpeg_quality=cfg.jpeg_quality,
            blur_prob=cfg.blur_prob if cfg.eot else 0.0,
            noise_std=cfg.noise_std if cfg.eot else 0.0,
            seed=cfg.seed,
        )

        # Normalisasi loss per VAE: jarak awal (tanpa serangan) = 1.0
        with torch.no_grad():
            zt0 = self._target_latents(target, work_hw, cache)
            x0 = resize(x, work_hw)
            norms = [max(F.mse_loss(encode(v, x0), z).item(), 1e-8) for v, z in zip(self.vaes, zt0)]

        def loss_fn(x_adv: torch.Tensor, size: tuple[int, int], photometric: bool) -> torch.Tensor:
            xi = resize(x_adv, size)
            if photometric:
                xi = sampler.photometric(xi)
            zts = self._target_latents(target, size, cache)
            losses = [F.mse_loss(encode(v, xi), zt) / n for v, zt, n in zip(self.vaes, zts, norms)]
            return torch.stack(losses).mean()

        if cfg.adaptive_eps:
            eps_map = texture_eps_map(x, cfg.eps, cfg.flat_ratio)
        else:
            eps_map = torch.full_like(x[:, :1], cfg.eps)

        delta = torch.zeros_like(x)
        if cfg.random_init:
            delta = (torch.rand_like(x) * 2 - 1) * eps_map

        history: list[float] = []
        for step in range(cfg.steps):
            delta.requires_grad_(True)
            total = 0.0
            grad = torch.zeros_like(delta)
            n = max(1, cfg.eot_samples)
            for _ in range(n):
                x_adv = (x + delta * m).clamp(0, 1)
                loss = loss_fn(x_adv, sampler.sample_size(), photometric=cfg.eot)
                (g,) = torch.autograd.grad(loss / n, delta)
                grad += g
                total += loss.item() / n
            with torch.no_grad():
                delta = delta - cfg.step_size * grad.sign()
                delta = torch.clamp(delta, -eps_map, eps_map)  # proyeksi ke bola L-inf (per piksel)
            history.append(total)
            if progress:
                progress(step + 1, cfg.steps, total)

        with torch.no_grad():
            out = to_uint8((x + delta * m).clamp(0, 1))
            # Evaluasi akhir setelah dibulatkan ke 8-bit, tanpa transformasi acak.
            final = loss_fn(to_tensor(out, self.device), work_hw, photometric=False).item()
        linf = float(np.abs(out.astype(np.int16) - image.astype(np.int16)).max())
        return ProtectResult(
            image=out,
            config=cfg,
            initial_loss=1.0,
            final_loss=final,
            linf=linf,
            seconds=time.time() - t0,
            loss_history=history,
        )


def protect_image(
    image: np.ndarray,
    vaes: Sequence | object,
    config: ProtectConfig | None = None,
    mask: np.ndarray | None = None,
    progress: Callable[[int, int, float], None] | None = None,
) -> ProtectResult:
    """Fungsi praktis: satu panggilan untuk melindungi satu gambar."""
    return EncoderAttack(vaes, config).protect(image, mask=mask, progress=progress)
