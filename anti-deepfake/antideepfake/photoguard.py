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
    chroma_prob: float = 0.0      # simulasi subsampling warna 4:2:0 (video); 0 untuk foto
    h264_prob: float = 0.0        # simulasi H.264 sungguhan via FFmpeg (video); 0 untuk foto
    h264_crf: tuple[int, int] = (23, 32)
    identity_weight: float = 0.0  # bobot serangan identitas ArcFace (anti face-swap); 0 = mati
    embed_weight: float = 1.0     # bobot serangan encoder multimodal (CLIP/SigLIP), jika diberikan
    crop_frac: float = 0.0        # EOT: crop acak hingga x% per sisi
    color: float = 0.0            # EOT: perubahan kecerahan/kontras/saturasi hingga +-x
    opt_max_side: int = 1024      # foto lebih besar dioptimasi di ukuran ini, perturbasi lalu diperbesar halus
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
    final_identity_cos: float | None = None  # cosine ArcFace vs wajah asli (jika serangan identitas aktif)
    final_embed_cos: list | None = None      # cosine tiap encoder multimodal vs gambar asli
    delta: np.ndarray | None = None          # perturbasi float (H, W, 3) skala 0-255, sebelum pembulatan

    def summary(self) -> dict:
        return {
            "initial_loss": self.initial_loss,
            "final_loss": self.final_loss,
            "final_identity_cos": self.final_identity_cos,
            "linf_0_255": self.linf,
            "seconds": round(self.seconds, 2),
            "config": asdict(self.config),
        }


def load_vae(model_id: str = DEFAULT_VAE, device: torch.device | str = "cpu", dtype=torch.float32):
    """Muat VAE dari Hugging Face. `model_id` bisa repo VAE atau repo pipeline SD
    (otomatis memakai subfolder `vae`), folder lokal, atau `taesd:<path>_encoder.pth`
    (encoder ringan TAESD, lihat taesd_adapter.py)."""
    if model_id.startswith("taesd:"):
        from .taesd_adapter import load_taesd

        return load_taesd(model_id[len("taesd:"):], device)
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


def _jitter_align(M: torch.Tensor, rng, shift: float = 2.0, scale: float = 0.03, rot_deg: float = 2.0) -> torch.Tensor:
    """Ganggu sedikit matriks align (B, 2, 3) agar perturbasi identitas tahan ketidakpasan
    posisi (landmark yang meleset, interpolasi antar-frame, resize)."""
    import math

    a = math.radians(rng.uniform(-rot_deg, rot_deg))
    s = 1 + rng.uniform(-scale, scale)
    c = 56.0  # pusat ruang 112x112
    R = torch.tensor([[s * math.cos(a), -s * math.sin(a)], [s * math.sin(a), s * math.cos(a)]], dtype=M.dtype, device=M.device)
    t = torch.tensor([rng.uniform(-shift, shift), rng.uniform(-shift, shift)], dtype=M.dtype, device=M.device)
    t = t + torch.tensor([c, c], dtype=M.dtype, device=M.device) - R @ torch.tensor([c, c], dtype=M.dtype, device=M.device)
    J = torch.cat([R, t[:, None]], 1)  # (2, 3)
    A = torch.cat([M, torch.tensor([0, 0, 1.0], dtype=M.dtype, device=M.device).expand(M.shape[0], 1, 3)], 1)
    return J.unsqueeze(0) @ A  # (B, 2, 3)


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

    `attack_batch` adalah inti PGD yang bekerja pada batch gambar berukuran sama
    (dipakai ulang oleh modul video); `protect` membungkusnya untuk satu foto.
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

    def make_sampler(self, work_hw: tuple[int, int]) -> EOTSampler:
        cfg = self.config
        return EOTSampler(
            work_hw,
            resize_range=cfg.resize_range if cfg.eot else (1.0, 1.0),
            jpeg_prob=cfg.jpeg_prob if cfg.eot else 0.0,
            jpeg_quality=cfg.jpeg_quality,
            blur_prob=cfg.blur_prob if cfg.eot else 0.0,
            noise_std=cfg.noise_std if cfg.eot else 0.0,
            chroma_prob=cfg.chroma_prob if cfg.eot else 0.0,
            h264_prob=cfg.h264_prob if cfg.eot else 0.0,
            h264_crf=cfg.h264_crf,
            crop_frac=cfg.crop_frac if cfg.eot else 0.0,
            color=cfg.color if cfg.eot else 0.0,
            seed=cfg.seed,
        )

    def attack_batch(
        self,
        x: torch.Tensor,
        mask: torch.Tensor | None = None,
        *,
        shared: bool = False,
        residual_ratio: float = 0.3,
        init_shared: torch.Tensor | None = None,
        identity: dict | None = None,
        embed: dict | None = None,
        progress: Callable[[int, int, float], None] | None = None,
    ) -> dict:
        """PGD pada batch x (B, 3, H, W) dalam [0, 1].

        mask   : (B or 1, 1, H, W) 0..1, area yang boleh diubah.
        shared : jika True, perturbasi = komponen BERSAMA (sama untuk seluruh batch)
                 + residual kecil per gambar (|residual| <= residual_ratio * eps).
                 Dipakai video agar perturbasi antar-frame mirip (tidak berkedip).
        init_shared : nilai awal komponen bersama (warm start dari chunk sebelumnya).
        identity    : hasil `ArcFaceTorch.prepare(...)`; jika diberikan dan
                 `config.identity_weight > 0`, loss juga meminimalkan cosine similarity
                 embedding ArcFace terhadap wajah asli (anti face-swap).

        Mengembalikan dict: delta (B,3,H,W), shared (1,3,H,W) atau None,
        eps_map, history (list loss), final_loss (B,) relatif terhadap jarak awal.
        """
        cfg = self.config
        B, _, H, W = x.shape
        x = x.to(self.device)
        m = torch.ones((1, 1, H, W), device=self.device) if mask is None else mask.to(self.device)

        # Ukuran yang dilihat encoder. Perturbasi tetap hidup di resolusi asli,
        # resize ke ukuran kerja dilakukan di dalam forward (diferensiabel).
        ww, wh = fit_size(W, H, cfg.work_size)
        work_hw = (wh, ww)
        target = _make_target(cfg.target, H, W, self.device, cfg.seed)
        cache: dict = {}
        sampler = self.make_sampler(work_hw)

        # Jika ada mask, hanya latent di area yang boleh diubah yang dihitung: latar yang tidak
        # boleh disentuh tidak bisa didekatkan ke target dan hanya "mengencerkan" loss.
        weighted = mask is not None

        def per_item_mse(z: torch.Tensor, zt: torch.Tensor) -> torch.Tensor:
            d = (z - zt) ** 2  # zt (1, ...) dibroadcast ke batch
            if not weighted:
                return d.flatten(1).mean(1)
            w = F.interpolate(m, size=z.shape[-2:], mode="area").expand(z.shape[0], 1, *z.shape[-2:])
            return (d * w).flatten(1).sum(1) / (w.flatten(1).sum(1) * z.shape[1]).clamp_min(1e-8)

        # Normalisasi loss per VAE & per gambar: jarak awal (tanpa serangan) = 1.0
        with torch.no_grad():
            zt0 = self._target_latents(target, work_hw, cache)
            x0 = resize(x, work_hw)
            norms = [per_item_mse(encode(v, x0), z).clamp_min(1e-8) for v, z in zip(self.vaes, zt0)]

        def loss_items(x_adv: torch.Tensor, size: tuple[int, int], photometric: bool) -> torch.Tensor:
            xi = resize(sampler.geometric(x_adv) if photometric else x_adv, size)
            if photometric:
                xi = sampler.photometric(xi)
            zts = self._target_latents(target, size, cache)
            per_vae = [per_item_mse(encode(v, xi), zt) / n for v, zt, n in zip(self.vaes, zts, norms)]
            return torch.stack(per_vae).mean(0)  # (B,)

        if cfg.adaptive_eps:
            eps_map = texture_eps_map(x, cfg.eps, cfg.flat_ratio)
        else:
            eps_map = torch.full_like(x[:, :1], cfg.eps)

        def rand_like(t, bound):
            return (torch.rand_like(t) * 2 - 1) * bound

        if shared:
            if init_shared is not None:
                sh = init_shared.to(self.device).clone()
            elif cfg.random_init:
                sh = rand_like(x[:1], cfg.eps)
            else:
                sh = torch.zeros_like(x[:1])
            res = torch.zeros_like(x)
            params = [sh, res]
        else:
            params = [rand_like(x, eps_map) if cfg.random_init else torch.zeros_like(x)]

        def compose(ps):
            d = ps[0] + ps[1] if shared else ps[0]
            return torch.clamp(d, -eps_map, eps_map)

        use_id = identity is not None and cfg.identity_weight > 0
        use_emb = embed is not None and cfg.embed_weight > 0

        def embed_cos(x_adv: torch.Tensor, eot: bool) -> torch.Tensor:
            """(n_encoder, B) cosine embedding terlindungi vs asli."""
            xi = sampler.photometric(sampler.geometric(x_adv)) if eot else x_adv
            return torch.stack([(m_.embed(xi.to(m_.device)) * r_).sum(-1).to(x_adv.device)
                                for m_, r_ in zip(embed["models"], embed["refs"])])

        def identity_cos(x_adv: torch.Tensor, eot: bool) -> torch.Tensor:
            xi = x_adv
            if eot:  # perkecil lalu perbesar lagi (koordinat landmark tetap), lalu transformasi fotometrik
                s = sampler.rng.uniform(*sampler.resize_range)
                xi = resize(resize(xi, (max(8, int(H * s)), max(8, int(W * s)))), (H, W))
                xi = sampler.photometric(xi)
            M = identity["M"]
            if eot:  # jitter alignment: geser +-2 px, skala +-3%, putar +-2 derajat (di ruang 112x112)
                M = _jitter_align(M, sampler.rng)
            e = identity["model"].embed(xi, M)
            return (e * identity["ref"]).sum(1)  # (B,)

        history: list[float] = []
        n = max(1, cfg.eot_samples)
        for step in range(cfg.steps):
            for p in params:
                p.requires_grad_(True)
            grads = [torch.zeros_like(p) for p in params]
            total = 0.0
            for _ in range(n):
                x_adv = (x + compose(params) * m).clamp(0, 1)
                loss = loss_items(x_adv, sampler.sample_size(), photometric=cfg.eot).mean()
                if use_id:
                    v = identity["valid"]
                    id_loss = (identity_cos(x_adv, cfg.eot) * v).sum() / v.sum()
                    loss = loss + cfg.identity_weight * id_loss
                if use_emb:
                    loss = loss + cfg.embed_weight * embed_cos(x_adv, cfg.eot).mean()
                gs = torch.autograd.grad(loss / n, params)
                for acc, g in zip(grads, gs):
                    acc += g
                total += loss.item() / n
            with torch.no_grad():
                params = [p - cfg.step_size * g.sign() for p, g in zip(params, grads)]
                if shared:
                    params[0] = params[0].clamp(-cfg.eps, cfg.eps)
                    params[1] = torch.clamp(params[1], -residual_ratio * eps_map, residual_ratio * eps_map)
                else:
                    params[0] = torch.clamp(params[0], -eps_map, eps_map)  # proyeksi ke bola L-inf (per piksel)
            history.append(total)
            if progress:
                progress(step + 1, cfg.steps, total)

        with torch.no_grad():
            delta = compose(params)
            final = loss_items((x + delta * m).clamp(0, 1), work_hw, photometric=False)
            final_id = identity_cos((x + delta * m).clamp(0, 1), False).cpu() if use_id else None
            final_emb = embed_cos((x + delta * m).clamp(0, 1), False).cpu() if use_emb else None
        return {
            "delta": delta * m,
            "shared": params[0].detach() if shared else None,
            "eps_map": eps_map,
            "history": history,
            "final_loss": final.detach().cpu(),
            "final_identity_cos": final_id,
            "final_embed_cos": final_emb,
            "work_hw": work_hw,
            "loss_fn": loss_items,
        }

    def protect(
        self,
        image: np.ndarray,
        mask: np.ndarray | None = None,
        progress: Callable[[int, int, float], None] | None = None,
        identity: dict | None = None,
        identity_model=None,
        embedders: list | None = None,
    ) -> ProtectResult:
        """Lindungi gambar RGB uint8 (H, W, 3).

        mask           : (H, W) 0..1 opsional, area yang boleh diubah (mis. hanya wajah).
        identity_model : `ArcFaceTorch` opsional (anti face-swap); landmark dicari otomatis.
        embedders      : daftar `Embedder` opsional (CLIP/SigLIP) untuk ensemble.
        identity       : (lama) hasil ArcFaceTorch.prepare yang sudah dihitung pada `image`.

        Foto besar (> opt_max_side) dioptimasi di versi kecilnya, lalu perturbasi diperbesar
        dengan interpolasi bikubik. Mengoptimasi langsung di resolusi penuh lewat resize
        menghasilkan pola kotak-kotak yang terlihat sebagai tekstur.
        """
        import cv2

        from . import embedders as emb_mod

        cfg = self.config
        t0 = time.time()
        torch.manual_seed(cfg.seed)
        H, W = image.shape[:2]
        scale = min(1.0, cfg.opt_max_side / max(H, W))
        small = image if scale >= 1 else cv2.resize(image, (max(8, round(W * scale)), max(8, round(H * scale))),
                                                     interpolation=cv2.INTER_AREA)
        small_mask = None
        if mask is not None:
            small_mask = mask if scale >= 1 else cv2.resize(mask, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_AREA)
        if identity_model is not None:
            identity = identity_model.prepare([small])
        elif identity is not None and scale < 1:
            identity = None  # matriks align dihitung untuk ukuran lain; aman dilewati
        x = to_tensor(small, self.device)
        m = None if small_mask is None else torch.from_numpy(small_mask.astype(np.float32))[None, None].to(self.device)
        emb = emb_mod.prepare(embedders or [], x)

        r = self.attack_batch(x, m, identity=identity, embed=emb, progress=progress)
        with torch.no_grad():
            d = r["delta"]
            xf = to_tensor(image, self.device)
            if scale < 1:
                d = F.interpolate(d, size=(H, W), mode="bicubic", align_corners=False)
                eps_full = texture_eps_map(xf, cfg.eps, cfg.flat_ratio) if cfg.adaptive_eps else torch.full_like(xf[:, :1], cfg.eps)
                d = torch.clamp(d, -eps_full, eps_full)
                if mask is not None:
                    d = d * torch.from_numpy(mask.astype(np.float32))[None, None].to(self.device)
            out = to_uint8((xf + d).clamp(0, 1))
            delta_np = (d[0].permute(1, 2, 0).cpu().numpy() * 255).astype(np.float32)
            # Evaluasi akhir setelah dibulatkan ke 8-bit, tanpa transformasi acak.
            final = r["loss_fn"](to_tensor(out, self.device), r["work_hw"], False).item()
        linf = float(np.abs(out.astype(np.int16) - image.astype(np.int16)).max())
        return ProtectResult(
            image=out,
            config=cfg,
            initial_loss=1.0,
            final_loss=final,
            linf=linf,
            seconds=time.time() - t0,
            loss_history=r["history"],
            final_identity_cos=float(r["final_identity_cos"][0]) if r["final_identity_cos"] is not None else None,
            final_embed_cos=r["final_embed_cos"][:, 0].tolist() if r["final_embed_cos"] is not None else None,
            delta=delta_np,
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
