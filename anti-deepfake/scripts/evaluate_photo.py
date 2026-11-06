#!/usr/bin/env python3
"""Uji perlindungan: bandingkan hasil editing AI pada foto ASLI vs TERLINDUNGI.

Yang diukur:
 1. Tak terlihat?      PSNR/SSIM foto asli vs terlindungi.
 2. Encoder tertipu?   Seberapa jauh latent VAE foto terlindungi bergeser dari
                       latent foto asli, dan kualitas rekonstruksi VAE.
 3. Edit gagal?        Jalankan Stable Diffusion img2img (prompt & seed sama) pada
                       kedua foto. Jika perlindungan bekerja, hasil edit foto
                       terlindungi berbeda jauh (SSIM rendah) dari hasil edit foto asli.
 4. Tahan kompresi?    Semua uji diulang setelah JPEG / resize (simulasi upload).

Contoh:
    # cepat, hanya uji VAE (tanpa diffusion, cukup ~1 GB VRAM / bisa di CPU):
    python scripts/evaluate_photo.py fotoku.jpg fotoku_protected.png --vae-only

    # uji lengkap dengan img2img:
    python scripts/evaluate_photo.py fotoku.jpg fotoku_protected.png \
        --prompt "foto berita seorang pria mencuri ayam di pasar malam"

    # uji transfer ke model lain (yang TIDAK dipakai saat melindungi):
    python scripts/evaluate_photo.py fotoku.jpg fotoku_protected.png \
        --model stabilityai/sdxl-turbo
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from antideepfake.device import pick_device  # noqa: E402
from antideepfake.faces import detect_faces  # noqa: E402
from antideepfake.evaluation import to_work, vae_metrics  # noqa: E402
from antideepfake.imageio import jpeg_roundtrip, load_rgb, resize_rgb  # noqa: E402
from antideepfake.metrics import psnr, similarity_report, ssim  # noqa: E402
from antideepfake.photoguard import DEFAULT_VAE, load_vae  # noqa: E402

DEFAULT_MODEL = "stable-diffusion-v1-5/stable-diffusion-v1-5"
DEFAULT_PROMPT = "news photo of a man caught stealing a chicken at a night market, police, realistic"


def apply_condition(image: np.ndarray, cond: str) -> np.ndarray:
    """none | jpegNN | resizeF | resizeF+jpegNN"""
    out = image
    for part in cond.split("+"):
        if part == "none":
            continue
        if part.startswith("jpeg"):
            out = jpeg_roundtrip(out, int(part[4:]))
        elif part.startswith("resize"):
            f = float(part[6:])
            h, w = out.shape[:2]
            out = resize_rgb(out, (max(8, int(w * f)), max(8, int(h * f))))
        else:
            raise ValueError(f"Kondisi tidak dikenal: {part}")
    return out


def label(img: np.ndarray, text: str, size: int = 256) -> Image.Image:
    h, w = img.shape[:2]
    s = size / max(h, w)
    im = Image.fromarray(img).resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size + 22), "white")
    canvas.paste(im, ((size - im.width) // 2, 22))
    ImageDraw.Draw(canvas).text((4, 4), text, fill="black")
    return canvas


def save_grid(panels: list[tuple[np.ndarray, str]], path: Path) -> None:
    tiles = [label(img, txt) for img, txt in panels]
    grid = Image.new("RGB", (sum(t.width for t in tiles), max(t.height for t in tiles)), "white")
    x = 0
    for t in tiles:
        grid.paste(t, (x, 0))
        x += t.width
    grid.save(path)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("original")
    ap.add_argument("protected", nargs="?", help="jika kosong, foto asli akan dilindungi dulu (preset balanced)")
    ap.add_argument("--out-dir", default="eval_output")
    ap.add_argument("--vae-only", action="store_true", help="lewati img2img, hanya uji encoder/decoder VAE")
    ap.add_argument("--vae", default=None, help=f"VAE untuk uji --vae-only (default: {DEFAULT_VAE})")
    ap.add_argument("--model", default=DEFAULT_MODEL, help="pipeline img2img yang dipakai 'penyerang'")
    ap.add_argument("--prompt", default=DEFAULT_PROMPT)
    ap.add_argument("--strength", type=float, default=0.6, help="kekuatan img2img (0-1)")
    ap.add_argument("--inference-steps", type=int, default=30)
    ap.add_argument("--guidance", type=float, default=7.5)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--work-size", type=int, default=512, help="ukuran yang dipakai penyerang (512 untuk SD1.5, 1024 untuk SDXL)")
    ap.add_argument("--conditions", default="none,jpeg95,jpeg75,jpeg50,resize0.5,resize0.75+jpeg75",
                    help="daftar simulasi kompresi, dipisah koma")
    ap.add_argument("--device", default="auto")
    args = ap.parse_args()

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    device = pick_device(args.device)

    original = load_rgb(args.original)
    if args.protected:
        protected = load_rgb(args.protected)
    else:
        from antideepfake.pipeline import protect_photo_file

        rep = protect_photo_file(args.original, out / "protected.png", device=args.device)
        protected = load_rgb(rep["output"])
    if protected.shape != original.shape:
        raise SystemExit("Ukuran foto asli dan terlindungi berbeda; gunakan pasangan file yang benar.")

    report: dict = {
        "imperceptibility": similarity_report(original, protected, with_lpips=True),
        "attacker_model": None if args.vae_only else args.model,
        "prompt": None if args.vae_only else args.prompt,
        "conditions": {},
    }

    pipe = None
    if args.vae_only:
        vae = load_vae(args.vae or DEFAULT_VAE, device)
    else:
        from diffusers import AutoPipelineForImage2Image

        dtype = torch.float16 if device.type == "cuda" else torch.float32
        pipe = AutoPipelineForImage2Image.from_pretrained(args.model, torch_dtype=dtype).to(device)
        pipe.set_progress_bar_config(disable=True)
        if hasattr(pipe, "safety_checker"):
            pipe.safety_checker = None  # gambar uji tidak perlu disensor
        # VAE fp32 terpisah untuk metrik (VAE milik pipeline tetap fp16).
        vae = load_vae(args.vae or args.model, device)

    for cond in [c.strip() for c in args.conditions.split(",") if c.strip()]:
        o = to_work(apply_condition(original, cond), args.work_size)
        p = to_work(apply_condition(protected, cond), args.work_size)
        vm, ro, rp = vae_metrics(vae, o, p, device)
        entry: dict = {"vae": vm}
        panels = [(o, f"asli [{cond}]"), (p, "terlindungi"),
                  (np.clip(np.abs(o.astype(int) - p.astype(int)) * 10, 0, 255).astype(np.uint8), "selisih x10"),
                  (ro, "VAE(asli)"), (rp, "VAE(terlindungi)")]

        if pipe is not None:
            edits = []
            for img in (o, p):
                g = torch.Generator(device="cpu").manual_seed(args.seed)
                res = pipe(prompt=args.prompt, image=Image.fromarray(img), strength=args.strength,
                           num_inference_steps=args.inference_steps, guidance_scale=args.guidance, generator=g)
                edits.append(np.asarray(res.images[0].convert("RGB").resize((o.shape[1], o.shape[0]))))
            eo, ep = edits
            entry["edit"] = {
                "ssim_edit_original_vs_edit_protected": round(ssim(eo, ep), 4),
                "psnr_edit_original_vs_edit_protected_db": round(psnr(eo, ep), 2),
                "faces_in_edit_original": len(detect_faces(eo)),
                "faces_in_edit_protected": len(detect_faces(ep)),
            }
            panels += [(eo, "edit AI dari asli"), (ep, "edit AI dari terlindungi")]

        grid_path = out / f"grid_{cond.replace('+', '_')}.png"
        save_grid(panels, grid_path)
        entry["grid"] = str(grid_path)
        report["conditions"][cond] = entry

    (out / "report.json").write_text(json.dumps(report, indent=2))

    imp = report["imperceptibility"]
    print(f"\nFoto asli vs terlindungi: PSNR {imp['psnr_db']} dB, SSIM {imp['ssim']}"
          + (f", LPIPS {imp['lpips']}" if "lpips" in imp else ""))
    print("\n| kondisi | latent shift | rekon VAE asli (dB) | rekon VAE terlindungi (dB) |"
          + (" SSIM edit asli vs edit terlindungi |" if pipe else ""))
    print("|---|---|---|---|" + ("---|" if pipe else ""))
    for cond, e in report["conditions"].items():
        v = e["vae"]
        row = f"| {cond} | {v['latent_shift']} | {v['recon_psnr_original_db']} | {v['recon_psnr_protected_db']} |"
        if pipe:
            row += f" {e['edit']['ssim_edit_original_vs_edit_protected']} |"
        print(row)
    print(f"\nCara membaca: latent shift besar, rekon VAE terlindungi jauh lebih rendah dari asli, dan SSIM edit"
          f" rendah (< ~0.5) = perlindungan bekerja. Gambar perbandingan & report.json ada di {out}/")


if __name__ == "__main__":
    main()
