#!/usr/bin/env python3
"""Uji ketahanan watermark: DCT-QIM (lapis 1), RivaGAN dan TrustMark (lapis 2).

Serangan: JPEG 75, resize 50%, crop 10%, perubahan warna, dan "regenerasi AI"
(gambar di-encode lalu di-decode oleh VAE, seperti saat editor AI menggambar ulang foto;
--vae bisa diulang). Hasil: persentase bit benar (50% = tebakan acak, >= 90% = terbaca).

    python scripts/eval_watermark.py foto1.jpg foto2.jpg --vae taesd:/m/taef1_encoder.pth
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from antideepfake.evaluation import vae_metrics  # noqa: E402
from antideepfake.imageio import fit_size, jpeg_roundtrip, load_rgb  # noqa: E402
from antideepfake.metrics import psnr, ssim  # noqa: E402
from antideepfake.photoguard import load_vae  # noqa: E402
from antideepfake import watermark as wm  # noqa: E402


def attacks(vaes: dict) -> dict:
    def resize_half(im):
        h, w = im.shape[:2]
        return cv2.resize(cv2.resize(im, (w // 2, h // 2), interpolation=cv2.INTER_AREA), (w, h))

    def crop10(im):
        h, w = im.shape[:2]
        return np.ascontiguousarray(im[h // 20: h - h // 20, w // 20: w - w // 20])

    def color(im):
        return np.clip(im.astype(np.float32) * 1.08 + 6, 0, 255).astype(np.uint8)

    out = {"tanpa serangan": lambda im: im, "JPEG 75": lambda im: jpeg_roundtrip(im, 75),
           "resize 50%": resize_half, "crop 10%": crop10, "warna +8%": color}
    for name, v in vaes.items():
        def regen(im, v=v):
            h, w = im.shape[:2]
            ww, hh = fit_size(w, h, 768)
            small = cv2.resize(im, (ww, hh), interpolation=cv2.INTER_AREA)
            _, _, rec = vae_metrics(v, small, small, "cpu")
            return cv2.resize(rec, (w, h), interpolation=cv2.INTER_CUBIC)
        out[f"regenerasi VAE {name}"] = regen
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("images", nargs="+")
    ap.add_argument("--vae", action="append", default=[])
    ap.add_argument("--methods", default="dct,rivagan,trustmark")
    args = ap.parse_args()

    vaes = {Path(v.split(":")[-1]).name.replace("_encoder.pth", ""): load_vae(v) for v in args.vae}
    atk = attacks(vaes)
    methods = {}
    for m in args.methods.split(","):
        if m == "dct":
            methods[m] = (wm.embed_watermark, lambda im, o: wm.detect_watermark(im, o)["bit_accuracy"])
        else:
            emb, det = wm.SECOND_LAYER[m]
            methods[m] = (emb, (lambda im, o, det=det: det(im, o).get("bit_accuracy",
                                                                      1.0 if det(im, o).get("owner_match") else 0.0)))
    res: dict = {}
    quality: dict = {}
    for p in args.images:
        img = load_rgb(p)
        for m, (emb, det) in methods.items():
            try:
                w = emb(img, "pemilik")
            except Exception as e:  # noqa: BLE001
                print(f"[!] {m} tidak bisa dipakai: {type(e).__name__}: {e}")
                continue
            quality.setdefault(m, []).append((psnr(img, w), ssim(img, w)))
            for a, fn in atk.items():
                try:
                    acc = det(fn(w), "pemilik")
                except Exception as e:  # noqa: BLE001
                    acc = float("nan")
                    print(f"[!] {m}/{a}: {e}")
                res.setdefault(m, {}).setdefault(a, []).append(acc)
    cols = list(atk)
    print("| watermark | PSNR / SSIM | " + " | ".join(cols) + " |")
    print("|---|---|" + "---|" * len(cols))
    for m, r in res.items():
        q = np.mean(quality[m], 0)
        print(f"| {m} | {q[0]:.1f} dB / {q[1]:.3f} | " + " | ".join(f"{np.nanmean(r[a]) * 100:.0f}%" for a in cols) + " |")
    print("\n(% bit benar, rata-rata semua gambar. 50% = tebakan acak; >= 90% = pemilik terbukti)")


if __name__ == "__main__":
    main()
