#!/usr/bin/env python3
"""Uji transferability: lindungi foto dengan encoder "latih", ukur efeknya di encoder
yang TIDAK ikut dilatih (held-out). Held-out adalah perkiraan terbaik untuk AI komersial,
yang encodernya tidak kita punya.

Untuk tiap encoder dan tiap kondisi (mentah / upload / kompresi berat) diukur:
  VAE      : jarak latent ke target abu-abu, relatif (1 = tidak berefek, makin kecil makin tertipu)
  CLIP/SigLIP & wajah : cosine embedding foto terlindungi vs asli (1 = sama, makin kecil makin terganggu)
Kontrol: noise acak dengan besar per-piksel SAMA (tanda diacak). Kalau hasil terlindungi tidak
lebih baik dari kontrol noise, berarti efeknya bukan dari serangan.

Contoh (encoder ringan, bisa di CPU):
    python scripts/eval_transfer.py foto1.jpg foto2.jpg --name ensemble \\
        --train-vae taesd:/m/taesd_encoder.pth --train-vae taesd:/m/taesdxl_encoder.pth \\
        --train-embedder siglip-npz:ViT-B-16-SigLIP:/m/webli_en_b16_224_63724782.npz \\
        --eval-vae taesd:/m/taesd3_encoder.pth --eval-vae taesd:/m/taef1_encoder.pth \\
        --eval-embedder siglip-npz:ViT-B-16-SigLIP-i18n-256:/m/webli_i18n_b16_256_66117334.npz \\
        --eval-face antelopev2
Di GPU dengan model asli, mis.:
    --train-vae stabilityai/sd-vae-ft-mse --train-embedder openclip:ViT-L-14:openai
    --eval-vae black-forest-labs/FLUX.1-schnell --eval-embedder openclip:hf-hub:timm/ViT-SO400M-14-SigLIP-384
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from antideepfake.device import pick_device  # noqa: E402
from antideepfake.evaluation import IdentityModel, to_work, vae_metrics  # noqa: E402
from antideepfake.imageio import jpeg_roundtrip, load_rgb, save_rgb, to_tensor  # noqa: E402
from antideepfake.metrics import psnr, ssim  # noqa: E402
from antideepfake.pipeline import get_embedders, get_vaes, protect_photo_file  # noqa: E402


def cond_apply(img: np.ndarray, cond: str) -> np.ndarray:
    def fit(im, side):
        h, w = im.shape[:2]
        f = side / max(h, w)
        return cv2.resize(im, (round(w * f), round(h * f)), interpolation=cv2.INTER_AREA) if f < 1 else im
    if cond == "mentah":
        return img
    if cond == "upload":  # mirip upload media sosial: maks 1024 px + JPEG 75
        return jpeg_roundtrip(fit(img, 1024), 75)
    if cond == "berat":  # kompresi berat: maks 512 px + JPEG 60
        return jpeg_roundtrip(fit(img, 512), 60)
    raise ValueError(cond)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("images", nargs="+")
    ap.add_argument("--name", default="exp")
    ap.add_argument("--out-dir", default="transfer_eval")
    ap.add_argument("--train-vae", action="append", required=True)
    ap.add_argument("--train-embedder", action="append", default=[])
    ap.add_argument("--no-identity", action="store_true", help="tanpa serangan ArcFace saat melindungi")
    ap.add_argument("--eval-vae", action="append", default=[], help="VAE held-out")
    ap.add_argument("--eval-embedder", action="append", default=[], help="encoder CLIP/SigLIP held-out")
    ap.add_argument("--eval-face", action="append", default=[], help="paket InsightFace held-out, mis. antelopev2")
    ap.add_argument("--weak-eot", action="store_true")
    ap.add_argument("--preset", default="balanced")
    ap.add_argument("--steps", type=int)
    ap.add_argument("--ssim-target", type=float, default=0.95)
    ap.add_argument("--conditions", default="mentah,upload,berat")
    ap.add_argument("--device", default="auto")
    args = ap.parse_args()

    out = Path(args.out_dir) / args.name
    out.mkdir(parents=True, exist_ok=True)
    dev = pick_device(args.device)
    conds = args.conditions.split(",")

    # Encoder evaluasi: semua encoder latih + held-out
    eval_vaes = {v: True for v in args.train_vae} | {v: False for v in args.eval_vae}
    eval_embs = {e: True for e in args.train_embedder} | {e: False for e in args.eval_embedder}
    faces = {"buffalo_l": not args.no_identity} | {f: False for f in args.eval_face}
    vae_models = {v: get_vaes([v], dev)[0] for v in eval_vaes}
    emb_models = {e: get_embedders([e], dev)[0] for e in eval_embs}
    face_models = {f: IdentityModel(f) for f in faces}

    def short(spec: str) -> str:
        return Path(spec.split(":")[-1]).name.replace("_encoder.pth", "").replace(".npz", "")

    rows: dict = {}
    per_image = []
    for img_path in args.images:
        img = load_rgb(img_path)
        t0 = time.time()
        rep = protect_photo_file(
            img_path, out / f"{Path(img_path).stem}_protected.png", preset=args.preset, owner="eval",
            vaes=[vae_models[v] for v in args.train_vae], embedders=[emb_models[e] for e in args.train_embedder],
            device=args.device, identity="off" if args.no_identity else "auto", strong_eot=not args.weak_eot,
            ssim_target=args.ssim_target or None, watermark=False,
            config_overrides={"steps": args.steps} if args.steps else None)
        prot = load_rgb(rep["output"])
        rng = np.random.default_rng(0)
        d = prot.astype(np.float32) - img.astype(np.float32)
        noise = np.clip(img + np.abs(d) * rng.choice([-1, 1], size=d.shape), 0, 255).astype(np.uint8)
        info = {"image": Path(img_path).name, "size": f"{img.shape[1]}x{img.shape[0]}",
                "psnr": round(psnr(img, prot), 2), "ssim": round(ssim(img, prot), 4),
                "strength": rep["strength_after_ssim_guard"], "seconds": round(time.time() - t0, 1)}
        per_image.append(info)
        print(f"[{args.name}] {info}", flush=True)

        for cond in conds:
            o, p, n = cond_apply(img, cond), cond_apply(prot, cond), cond_apply(noise, cond)
            for v, trained in eval_vaes.items():
                for tag, x in (("prot", p), ("noise", n)):
                    m, _, _ = vae_metrics(vae_models[v], to_work(o, 512), to_work(x, 512), dev)
                    rows.setdefault(("VAE", short(v), trained, cond, tag), []).append(m["target_distance_rel"])
            for e, trained in eval_embs.items():
                em = emb_models[e]
                with torch.no_grad():
                    eo = em.embed(to_tensor(o, em.device))
                    for tag, x in (("prot", p), ("noise", n)):
                        rows.setdefault(("CLIP/SigLIP", short(e), trained, cond, tag), []).append(
                            float((eo * em.embed(to_tensor(x, em.device))).sum()))
            for f, trained in faces.items():
                fm = face_models[f]
                eo = fm.embed(o)
                for tag, x in (("prot", p), ("noise", n)):
                    s = fm.similarity(eo, fm.embed(x))
                    rows.setdefault(("Wajah", f, trained, cond, tag), []).append(0.0 if s is None else s)

    # tabel: satu baris per (jenis, encoder), kolom per kondisi: terlindungi (kontrol noise)
    table = {}
    for (kind, name, trained, cond, tag), vals in rows.items():
        table.setdefault((kind, name, trained), {}).setdefault(cond, {})[tag] = round(float(np.mean(vals)), 3)
    lines = [f"### {args.name}", "",
             "| encoder | status | " + " | ".join(f"{c}: terlindungi (noise)" for c in conds) + " |",
             "|---|---|" + "---|" * len(conds)]
    for (kind, name, trained), cols in table.items():
        cells = " | ".join(f"**{cols[c]['prot']}** ({cols[c]['noise']})" for c in conds)
        lines.append(f"| {kind}: {name} | {'dilatih' if trained else 'HELD-OUT'} | {cells} |")
    q = " ; ".join(f"{i['image']} {i['size']}: SSIM {i['ssim']}, PSNR {i['psnr']} dB, kekuatan {i['strength']}, {i['seconds']} s"
                   for i in per_image)
    lines += ["", f"Kualitas: {q}"]
    md = "\n".join(lines)
    print("\n" + md)
    (out / "report.md").write_text(md + "\n")
    (out / "report.json").write_text(json.dumps({"images": per_image, "rows": [
        {"kind": k, "encoder": n, "trained": t, **{c: v for c, v in cols.items()}} for (k, n, t), cols in table.items()]},
        indent=2))


if __name__ == "__main__":
    main()
