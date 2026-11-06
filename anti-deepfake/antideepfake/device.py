"""Pemilihan device (GPU NVIDIA, Apple Silicon, atau CPU)."""

from __future__ import annotations

import torch


def pick_device(requested: str | None = None) -> torch.device:
    """Kembalikan device yang diminta, atau yang terbaik yang tersedia."""
    if requested and requested != "auto":
        return torch.device(requested)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")
