"""Serangan identitas (anti face-swap / anti face-recognition), pendekatan ala Fawkes.

Kenapa perlu: perlindungan VAE (PhotoGuard) merusak hasil editing Stable Diffusion,
tetapi TIDAK mengubah embedding identitas wajah. Face swap klasik seperti InsightFace
inswapper, Roop/FaceFusion, dan SimSwap mengambil identitas sumber dari embedding
ArcFace. Jadi tanpa serangan ini, wajahmu tetap bisa ditempel ke video lain.

Cara kerja: wajah di-align ke 112x112 (5 titik landmark, transformasi similarity
yang sama dengan InsightFace) secara diferensiabel, lalu dihitung embedding ArcFace
(model w600k_r50 dari paket buffalo_l, dikonversi ONNX -> PyTorch dengan onnx2torch).
PGD meminimalkan cosine similarity embedding itu terhadap embedding wajah asli.

Catatan jujur: ini white-box terhadap ArcFace w600k_r50, yang juga dipakai inswapper
dan banyak turunan Roop/FaceFusion. Terhadap pengenal wajah lain (FaceNet, AdaFace,
model komersial) efeknya bisa jauh lebih lemah.

Butuh: pip install insightface onnxruntime onnx2torch
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

ARCFACE_FILE = Path.home() / ".insightface" / "models" / "buffalo_l" / "w600k_r50.onnx"


def available() -> bool:
    try:
        import insightface  # noqa: F401
        import onnx2torch  # noqa: F401
    except ImportError:
        return False
    return True


def warp_affine(x: torch.Tensor, M: torch.Tensor, size: int = 112) -> torch.Tensor:
    """Setara cv2.warpAffine(img, M, (size, size)) tetapi diferensiabel.
    x: (B, C, H, W); M: (B, 2, 3) memetakan koordinat sumber -> tujuan (piksel)."""
    B, _, H, W = x.shape
    A = torch.cat([M, torch.tensor([0, 0, 1.0], device=M.device).expand(B, 1, 3)], 1)
    Ainv = torch.linalg.inv(A)[:, :2]  # tujuan -> sumber
    v, u = torch.meshgrid(torch.arange(size, device=x.device, dtype=x.dtype),
                          torch.arange(size, device=x.device, dtype=x.dtype), indexing="ij")
    ones = torch.ones_like(u)
    dst = torch.stack([u, v, ones], -1).view(1, -1, 3)  # (1, size*size, 3)
    src = dst @ Ainv.transpose(1, 2)  # (B, size*size, 2)
    gx = src[..., 0] / (W - 1) * 2 - 1
    gy = src[..., 1] / (H - 1) * 2 - 1
    grid = torch.stack([gx, gy], -1).view(B, size, size, 2)
    return F.grid_sample(x, grid, mode="bilinear", padding_mode="border", align_corners=True)


class ArcFaceTorch:
    """ArcFace w600k_r50 (InsightFace buffalo_l) dalam PyTorch + detektor landmark."""

    def __init__(self, device: torch.device | str = "cpu") -> None:
        from onnx2torch import convert

        from .evaluation import _insightface_app

        self.app = _insightface_app(["detection"])  # sekaligus memastikan buffalo_l terunduh
        self.device = torch.device(device)
        self.model = convert(str(ARCFACE_FILE)).eval().to(self.device).requires_grad_(False)

    def landmarks(self, rgb: np.ndarray) -> np.ndarray | None:
        faces = self.app.get(np.ascontiguousarray(rgb[:, :, ::-1]))
        if not faces:
            return None
        f = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        return f.kps.astype(np.float32)

    @staticmethod
    def align_matrix(kps: np.ndarray) -> np.ndarray:
        from insightface.utils import face_align

        return face_align.estimate_norm(kps, 112).astype(np.float32)

    def embed(self, x01: torch.Tensor, M: torch.Tensor) -> torch.Tensor:
        """x01 (B, 3, H, W) RGB [0, 1], M (B, 2, 3) -> embedding ternormalisasi (B, 512)."""
        face = warp_affine(x01, M.to(x01.device))
        e = self.model(face * 2 - 1)  # (x*255 - 127.5) / 127.5
        return F.normalize(e, dim=1)

    def prepare(self, crops: list[np.ndarray]) -> dict | None:
        """Landmark, matriks align, dan embedding acuan untuk sekumpulan crop.
        Crop tanpa wajah terdeteksi diberi bobot 0."""
        Ms, valid = [], []
        for c in crops:
            k = self.landmarks(c)
            valid.append(k is not None)
            Ms.append(self.align_matrix(k) if k is not None else np.eye(2, 3, dtype=np.float32))
        if not any(valid):
            return None
        M = torch.from_numpy(np.stack(Ms)).to(self.device)
        x = torch.stack([torch.from_numpy(np.array(c, copy=True)).permute(2, 0, 1).float() / 255 for c in crops]).to(self.device)
        with torch.no_grad():
            ref = self.embed(x, M)
        return {"model": self, "M": M, "ref": ref, "valid": torch.tensor(valid, dtype=torch.float32, device=self.device)}
