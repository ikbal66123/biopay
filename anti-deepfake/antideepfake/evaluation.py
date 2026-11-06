"""Alat bantu evaluasi bersama (foto & video): metrik VAE, identitas wajah, dan "penyerang".

- `vae_metrics`      : seberapa jauh encoder VAE tertipu (latent shift, kualitas rekonstruksi).
- `IdentityModel`    : embedding wajah ArcFace (InsightFace buffalo_l) untuk mengukur
                       apakah wajah di hasil fake masih dikenali sebagai kamu.
- `Img2ImgAttacker`  : Stable Diffusion img2img (diffusers), prompt & seed tetap.
- `FaceSwapAttacker` : InsightFace inswapper_128: identitas dari frame kita ditempel
                       ke wajah di gambar target (skenario deepfake klasik).
"""

from __future__ import annotations

import numpy as np
import torch
from PIL import Image

from .imageio import fit_size, resize_rgb, to_tensor, to_uint8
from .metrics import psnr
from .photoguard import encode


def to_work(image: np.ndarray, size: int) -> np.ndarray:
    h, w = image.shape[:2]
    return resize_rgb(image, fit_size(w, h, size))


@torch.no_grad()
def vae_metrics(vae, orig: np.ndarray, prot: np.ndarray, device) -> tuple[dict, np.ndarray, np.ndarray]:
    xo, xp = to_tensor(orig, device), to_tensor(prot, device)
    zo, zp = encode(vae, xo), encode(vae, xp)
    dtype = next(vae.parameters()).dtype

    def dec(z):
        return ((vae.decode(z.to(dtype)).sample.float() + 1) / 2).clamp(0, 1)

    ro, rp = to_uint8(dec(zo)), to_uint8(dec(zp))
    # Jarak ke latent target abu-abu (target default perlindungan), relatif terhadap foto asli:
    # 1.0 = tidak berpengaruh, makin kecil = encoder makin "melihat" abu-abu. Metrik ini tidak
    # ikut naik hanya karena noise kompresi (beda dengan latent_shift).
    zg = encode(vae, torch.full_like(xo, 0.5))
    target_rel = float(((zp - zg) ** 2).mean() / ((zo - zg) ** 2).mean().clamp_min(1e-12))
    return (
        {
            "latent_shift": round(float((zp - zo).norm() / zo.norm()), 4),
            "target_distance_rel": round(target_rel, 4),
            "recon_psnr_original_db": round(psnr(ro, orig), 2),
            "recon_psnr_protected_db": round(psnr(rp, prot), 2),
        },
        ro,
        rp,
    )


def _insightface_app(modules=None):
    from insightface.app import FaceAnalysis

    from .faces import _onnx_providers

    providers, ctx = _onnx_providers()
    kw = {"allowed_modules": modules} if modules else {}
    app = FaceAnalysis(name="buffalo_l", providers=providers, **kw)
    app.prepare(ctx_id=ctx, det_size=(640, 640))
    return app


class IdentityModel:
    """Embedding identitas ArcFace (512-d, ternormalisasi). Cosine similarity:
    > ~0.5 umumnya dianggap orang yang sama oleh sistem pengenal wajah, < ~0.3 orang berbeda."""

    def __init__(self) -> None:
        self.app = _insightface_app(["detection", "recognition"])

    def faces(self, rgb: np.ndarray):
        return self.app.get(np.ascontiguousarray(rgb[:, :, ::-1]))

    def embed(self, rgb: np.ndarray) -> np.ndarray | None:
        fs = self.faces(rgb)
        if not fs:
            return None
        f = max(fs, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        return f.normed_embedding.astype(np.float32)

    @staticmethod
    def similarity(a: np.ndarray | None, b: np.ndarray | None) -> float | None:
        if a is None or b is None:
            return None
        return float(np.dot(a, b))


class Img2ImgAttacker:
    def __init__(self, model: str, device: torch.device, prompt: str, strength: float = 0.6,
                 steps: int = 30, guidance: float = 7.5, seed: int = 42, work_size: int = 512) -> None:
        from diffusers import AutoPipelineForImage2Image

        dtype = torch.float16 if device.type == "cuda" else torch.float32
        self.pipe = AutoPipelineForImage2Image.from_pretrained(model, torch_dtype=dtype).to(device)
        self.pipe.set_progress_bar_config(disable=True)
        if hasattr(self.pipe, "safety_checker"):
            self.pipe.safety_checker = None  # gambar uji tidak perlu disensor
        self.prompt, self.strength, self.steps, self.guidance = prompt, strength, steps, guidance
        self.seed, self.work_size = seed, work_size

    def __call__(self, rgb: np.ndarray) -> np.ndarray:
        img = to_work(rgb, self.work_size)
        g = torch.Generator(device="cpu").manual_seed(self.seed)
        res = self.pipe(prompt=self.prompt, image=Image.fromarray(img), strength=self.strength,
                        num_inference_steps=self.steps, guidance_scale=self.guidance, generator=g)
        return np.asarray(res.images[0].convert("RGB").resize((img.shape[1], img.shape[0])))


class FaceSwapAttacker:
    """Tempel identitas dari `source` ke wajah terbesar di gambar target.

    Model inswapper_128.onnx tidak lagi didistribusikan resmi oleh InsightFace dan
    lisensinya non-komersial; unduh sendiri dan berikan path-nya.
    """

    def __init__(self, model_path: str, target_rgb: np.ndarray) -> None:
        import insightface

        from .faces import _onnx_providers

        self.app = _insightface_app(["detection", "recognition"])
        providers, _ = _onnx_providers()
        self.swapper = insightface.model_zoo.get_model(model_path, providers=providers)
        self.target_bgr = np.ascontiguousarray(target_rgb[:, :, ::-1])
        faces = self.app.get(self.target_bgr)
        if not faces:
            raise ValueError("Tidak ada wajah di gambar target face swap.")
        self.target_face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

    def __call__(self, source_rgb: np.ndarray) -> np.ndarray | None:
        src = self.app.get(np.ascontiguousarray(source_rgb[:, :, ::-1]))
        if not src:
            return None  # detektor gagal menemukan wajah sumber = swap gagal
        s = max(src, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        out = self.swapper.get(self.target_bgr.copy(), self.target_face, s, paste_back=True)
        return np.ascontiguousarray(out[:, :, ::-1])
