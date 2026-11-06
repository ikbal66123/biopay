"""Adapter TAESD (Tiny AutoEncoder for Stable Diffusion, github.com/madebyollin/taesd, MIT).

TAESD adalah encoder/decoder kecil (~1-5 MB) yang dilatih meniru VAE asli dan
memakai ruang latent yang sama:
  taesd   -> SD 1.x / 2.x      taesdxl -> SDXL
  taesd3  -> SD3               taef1   -> Flux.1
Kegunaannya di sini:
  - menguji pipeline tanpa GPU / tanpa mengunduh VAE besar,
  - ensemble murah untuk keluarga model lain (SDXL, SD3, Flux) demi transfer.

Perlindungan terhadap TAESD TIDAK sama dengan perlindungan terhadap VAE aslinya;
selalu verifikasi dengan VAE asli bila memungkinkan.

Arsitektur ditulis ulang di sini (varian standar 8x downsampling); dari repo TAESD
hanya file bobot `*_encoder.pth` / `*_decoder.pth` yang dipakai, dimuat sebagai data
(`torch.load(weights_only=True)`), tanpa menjalankan kode dari repo tersebut.

Pemakaian: --vae taesd:/path/ke/taesdxl_encoder.pth
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import torch
from torch import nn

LATENT_CHANNELS = {"taesd": 4, "taesdxl": 4, "taesd3": 16, "taef1": 16}


def _conv(n_in: int, n_out: int, **kw) -> nn.Conv2d:
    return nn.Conv2d(n_in, n_out, 3, padding=1, **kw)


class _Clamp(nn.Module):
    def forward(self, x):
        return torch.tanh(x / 3) * 3


class _Block(nn.Module):
    def __init__(self, n_in: int, n_out: int) -> None:
        super().__init__()
        self.conv = nn.Sequential(_conv(n_in, n_out), nn.ReLU(), _conv(n_out, n_out), nn.ReLU(), _conv(n_out, n_out))
        self.skip = nn.Conv2d(n_in, n_out, 1, bias=False) if n_in != n_out else nn.Identity()
        self.fuse = nn.ReLU()

    def forward(self, x):
        return self.fuse(self.conv(x) + self.skip(x))


def _encoder(c: int) -> nn.Sequential:
    return nn.Sequential(
        _conv(3, 64), _Block(64, 64),
        _conv(64, 64, stride=2, bias=False), _Block(64, 64), _Block(64, 64), _Block(64, 64),
        _conv(64, 64, stride=2, bias=False), _Block(64, 64), _Block(64, 64), _Block(64, 64),
        _conv(64, 64, stride=2, bias=False), _Block(64, 64), _Block(64, 64), _Block(64, 64),
        _conv(64, c),
    )


def _decoder(c: int) -> nn.Sequential:
    up = nn.Upsample(scale_factor=2)
    return nn.Sequential(
        _Clamp(), _conv(c, 64), nn.ReLU(),
        _Block(64, 64), _Block(64, 64), _Block(64, 64), up, _conv(64, 64, bias=False),
        _Block(64, 64), _Block(64, 64), _Block(64, 64), nn.Upsample(scale_factor=2), _conv(64, 64, bias=False),
        _Block(64, 64), _Block(64, 64), _Block(64, 64), nn.Upsample(scale_factor=2), _conv(64, 64, bias=False),
        _Block(64, 64), _conv(64, 3),
    )


class TAESDWrapper(nn.Module):
    """Meniru antarmuka diffusers AutoencoderKL: encode(x[-1,1]).latent_dist.mean, decode(z).sample."""

    def __init__(self, encoder: nn.Module, decoder: nn.Module | None) -> None:
        super().__init__()
        self.encoder = encoder
        self.decoder = decoder

    def encode(self, x: torch.Tensor):
        z = self.encoder((x + 1) / 2)  # TAESD menerima gambar [0, 1]
        return SimpleNamespace(latent_dist=SimpleNamespace(mean=z))

    def decode(self, z: torch.Tensor):
        if self.decoder is None:
            raise RuntimeError("Decoder TAESD tidak tersedia (file *_decoder.pth tidak ditemukan).")
        return SimpleNamespace(sample=self.decoder(z).clamp(0, 1) * 2 - 1)


def load_taesd(encoder_path: str, device="cpu") -> TAESDWrapper:
    enc_path = Path(encoder_path).expanduser()
    name = enc_path.name.replace("_encoder.pth", "")
    if name not in LATENT_CHANNELS:
        raise ValueError(f"Varian TAESD tidak didukung: {name}. Pilihan: {list(LATENT_CHANNELS)}")
    c = LATENT_CHANNELS[name]
    enc = _encoder(c)
    enc.load_state_dict(torch.load(enc_path, map_location="cpu", weights_only=True))
    dec_path = enc_path.with_name(f"{name}_decoder.pth")
    dec = None
    if dec_path.exists():
        dec = _decoder(c)
        dec.load_state_dict(torch.load(dec_path, map_location="cpu", weights_only=True))
    return TAESDWrapper(enc, dec).to(device).eval().requires_grad_(False)
