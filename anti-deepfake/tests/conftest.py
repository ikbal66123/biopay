import sys
from pathlib import Path

import numpy as np
import pytest
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


@pytest.fixture(scope="session")
def tiny_vae():
    """VAE kecil berbobot acak (arsitektur sama dengan SD: downsample 8x, latent 4 kanal).
    Cukup untuk menguji logika tanpa mengunduh model asli."""
    from diffusers import AutoencoderKL

    torch.manual_seed(0)
    vae = AutoencoderKL(
        in_channels=3,
        out_channels=3,
        down_block_types=("DownEncoderBlock2D",) * 4,
        up_block_types=("UpDecoderBlock2D",) * 4,
        block_out_channels=(8, 16, 16, 16),
        layers_per_block=1,
        latent_channels=4,
        norm_num_groups=8,
        sample_size=64,
    )
    return vae.eval().requires_grad_(False)


def natural_image(h: int, w: int, seed: int = 0) -> np.ndarray:
    """Gambar sintetis halus + tekstur (lebih mirip foto daripada noise murni)."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w] / max(h, w)
    base = np.stack([np.sin(6 * xx + 1), np.cos(5 * yy), np.sin(4 * (xx + yy))], -1)
    img = (base * 0.35 + 0.5 + rng.normal(0, 0.04, (h, w, 3))) * 255
    return np.clip(img, 0, 255).astype(np.uint8)


@pytest.fixture
def make_image():
    return natural_image
