"""Encoder gambar multimodal (CLIP / SigLIP) untuk serangan ensemble.

Model AI "pintar" (ChatGPT, Gemini, editor gambar berbasis instruksi) memakai
encoder visi seperti CLIP atau SigLIP untuk "memahami" gambar. Serangan di sini
mendorong embedding gambar terlindungi menjauh dari embedding gambar asli
(cosine similarity diminimalkan), di bawah batas perubahan piksel yang sama.

Catatan jujur: model komersial memakai encoder milik sendiri yang tidak kita
punya. Menyerang beberapa encoder terbuka sekaligus (ensemble) hanya
*meningkatkan peluang* efeknya menular, tanpa jaminan. Uji held-out di
scripts/eval_transfer.py adalah perkiraan terbaik yang tersedia.

Spesifikasi (string) yang didukung `load_embedder`:
  openclip:<arsitektur>:<pretrained>   mis. openclip:ViT-L-14:openai  (CLIP ViT-L/14)
  openclip:hf-hub:timm/ViT-SO400M-14-SigLIP-384                       (SigLIP So400m)
  siglip-npz:<arsitektur>:<path .npz>  bobot SigLIP asli Google (big_vision), mis.
      siglip-npz:ViT-B-16-SigLIP:/path/webli_en_b16_224_63724782.npz
Butuh: pip install open_clip_torch
"""

from __future__ import annotations

import torch
import torch.nn.functional as F


class Embedder:
    """Membungkus encoder visi open_clip: embed(x01) -> embedding ternormalisasi (B, D)."""

    def __init__(self, model, size: int, mean, std, name: str, device) -> None:
        self.model = model.eval().requires_grad_(False).to(device)
        self.size = size
        self.mean = torch.tensor(mean, device=device).view(1, 3, 1, 1)
        self.std = torch.tensor(std, device=device).view(1, 3, 1, 1)
        self.name = name
        self.device = device

    def embed(self, x01: torch.Tensor) -> torch.Tensor:
        x = F.interpolate(x01, size=(self.size, self.size), mode="bilinear", align_corners=False, antialias=True)
        e = self.model.encode_image((x - self.mean) / self.std)
        return F.normalize(e.float(), dim=-1)


def load_embedder(spec: str, device="cpu") -> Embedder:
    import open_clip

    kind, _, rest = spec.partition(":")
    if kind == "openclip":
        if rest.startswith("hf-hub:"):
            model = open_clip.create_model(rest)
        else:
            arch, _, pretrained = rest.partition(":")
            model = open_clip.create_model(arch, pretrained=pretrained or None)
    elif kind == "siglip-npz":
        from open_clip.convert import load_big_vision_weights

        arch, _, path = rest.partition(":")
        model = open_clip.create_model(arch, pretrained=None)
        load_big_vision_weights(model, path)
    else:
        raise ValueError(f"Spesifikasi encoder tidak dikenal: {spec}")
    cfg = getattr(model.visual, "preprocess_cfg", {}) or {}
    size = cfg.get("size", getattr(model.visual, "image_size", 224))
    size = size[0] if isinstance(size, (tuple, list)) else size
    mean = cfg.get("mean", (0.48145466, 0.4578275, 0.40821073))
    std = cfg.get("std", (0.26862954, 0.26130258, 0.27577711))
    return Embedder(model, int(size), mean, std, spec, device)


def prepare(embedders: list[Embedder], x01: torch.Tensor) -> dict | None:
    """Embedding acuan (gambar asli) untuk tiap encoder."""
    if not embedders:
        return None
    with torch.no_grad():
        refs = [e.embed(x01.to(e.device)) for e in embedders]
    return {"models": embedders, "refs": refs}
