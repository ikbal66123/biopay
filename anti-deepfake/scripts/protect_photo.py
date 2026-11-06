#!/usr/bin/env python3
"""Lindungi foto dari editing/deepfake berbasis AI.

Contoh paling sederhana (tanpa pengaturan apa pun):
    python scripts/protect_photo.py fotoku.jpg

Hasil: fotoku_protected.png (foto terlindungi) + fotoku_protected.json (manifest bukti).
"""

from __future__ import annotations

import argparse
import getpass
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from antideepfake.photoguard import DEFAULT_VAE, PRESETS  # noqa: E402
from antideepfake.pipeline import protect_photo_file  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", nargs="+", help="file foto (bisa lebih dari satu)")
    ap.add_argument("-o", "--output", help="file hasil (hanya jika input satu file). Default: <nama>_protected.png")
    ap.add_argument("--preset", default="balanced", choices=list(PRESETS), help="fast / balanced / strong")
    ap.add_argument("--owner", default=None, help="ID pemilik untuk watermark (default: nama user OS)")
    ap.add_argument("--face-only", action="store_true", help="hanya lindungi area wajah (default: seluruh foto)")
    ap.add_argument("--no-watermark", action="store_true")
    ap.add_argument("--vae", action="append", help=f"model VAE yang diserang, bisa diulang untuk ensemble (default: {DEFAULT_VAE})")
    ap.add_argument("--target", help="gray / noise / path gambar target")
    ap.add_argument("--eps", type=float, help="batas perubahan per piksel dalam skala 0-255 (default preset: 8)")
    ap.add_argument("--steps", type=int, help="jumlah iterasi PGD")
    ap.add_argument("--no-eot", action="store_true", help="matikan simulasi resize/JPEG saat optimasi")
    ap.add_argument("--no-adaptive", action="store_true", help="eps sama rata di semua piksel (tanpa masking tekstur)")
    ap.add_argument("--device", default="auto", help="auto / cuda / mps / cpu")
    ap.add_argument("--fp16", action="store_true", help="VAE half precision di GPU (lebih cepat, sedikit kurang presisi)")
    args = ap.parse_args()

    if args.output and len(args.input) > 1:
        ap.error("--output hanya bisa dipakai dengan satu file input")

    overrides = {
        "target": args.target,
        "eps": args.eps / 255 if args.eps is not None else None,
        "steps": args.steps,
        "eot": False if args.no_eot else None,
        "adaptive_eps": False if args.no_adaptive else None,
    }
    owner = args.owner or getpass.getuser()

    for path in args.input:
        print(f"==> Melindungi {path}")

        def progress(i: int, n: int, loss: float) -> None:
            if i == 1 or i % max(1, n // 10) == 0 or i == n:
                print(f"    iterasi {i:4d}/{n}  jarak-ke-target {loss:.4f}", flush=True)

        report = protect_photo_file(
            path,
            args.output,
            preset=args.preset,
            owner=owner,
            face_only=args.face_only,
            watermark=not args.no_watermark,
            vae_ids=args.vae or [DEFAULT_VAE],
            device=args.device,
            fp16=args.fp16,
            config_overrides=overrides,
            progress=progress,
        )
        imp = report["imperceptibility"]
        att = report["attack"]
        print(f"    wajah terdeteksi : {report['faces_detected']}")
        print(f"    PSNR / SSIM      : {imp['psnr_db']} dB / {imp['ssim']}  (perubahan maks {imp['linf_0_255']}/255)")
        print(f"    jarak latent     : {att['initial_loss']:.3f} -> {att['final_loss']:.3f}  (makin kecil = encoder makin tertipu)")
        if report["watermark"]:
            print(f"    watermark        : terbaca={report['watermark']['owner_match']}")
        print(f"    hasil            : {report['output']}")
        print(f"    manifest         : {report['manifest']}")
        print(f"    waktu            : {att['seconds']} s")
    if len(args.input) == 1:
        print(json.dumps({"output": report["output"], "manifest": report["manifest"]}))


if __name__ == "__main__":
    main()
