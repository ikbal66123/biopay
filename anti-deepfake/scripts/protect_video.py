#!/usr/bin/env python3
"""Lindungi wajah di dalam VIDEO dari editing/deepfake berbasis AI.

Contoh paling sederhana:
    python scripts/protect_video.py videoku.mp4

Hasil: videoku_protected.mp4 (resolusi, fps, durasi & audio sama) + videoku_protected.json (manifest).
"""

from __future__ import annotations

import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from antideepfake.photoguard import DEFAULT_VAE  # noqa: E402
from antideepfake.protect_video import VIDEO_PRESETS, VideoProtectConfig, protect_video  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", help="file video (mp4/mov/...)")
    ap.add_argument("-o", "--output", help="file hasil .mp4 (default: <nama>_protected.mp4)")
    ap.add_argument("--preset", default="balanced", choices=list(VIDEO_PRESETS))
    ap.add_argument("--key-interval", type=int, help="jarak antar keyframe (frame). Kecil = lebih kuat & lebih lambat")
    ap.add_argument("--steps", type=int, help="iterasi PGD per batch keyframe")
    ap.add_argument("--eps", type=float, help="batas perubahan per piksel, skala 0-255")
    ap.add_argument("--batch-size", type=int, default=4, help="keyframe per batch GPU (turunkan jika VRAM habis)")
    ap.add_argument("--crop-max", type=int, default=512, help="ukuran maksimum crop wajah yang dioptimasi")
    ap.add_argument("--detector", default="auto", choices=["auto", "insightface", "haar"])
    ap.add_argument("--identity", default="auto", choices=["auto", "on", "off"],
                    help="serangan identitas ArcFace (anti face-swap). auto = aktif jika insightface+onnx2torch terpasang")
    ap.add_argument("--residual-ratio", type=float, default=None,
                    help="seberapa bebas tiap keyframe menyimpang dari pola bersama (0-1, default 0.3)")
    ap.add_argument("--shared-pattern", action="store_true",
                    help="pola perturbasi bersama per wajah (eksperimental; terukur melemahkan anti face-swap)")
    ap.add_argument("--no-h264-eot", action="store_true", help="matikan simulasi H.264 saat optimasi (lebih cepat, kurang tahan kompresi)")
    ap.add_argument("--crf", type=int, default=14, help="kualitas H.264 output (default 14 = praktis lossless visual)")
    ap.add_argument("--watermark", action="store_true", help="tambahkan watermark tak terlihat di tiap frame")
    ap.add_argument("--owner", default=None)
    ap.add_argument("--keep-audio", action="store_true", help="simpan juga audio asli terpisah (<nama>_audio.mka) untuk Tahap 3")
    ap.add_argument("--vae", action="append", help=f"VAE yang diserang, bisa diulang (default: {DEFAULT_VAE})")
    ap.add_argument("--device", default="auto")
    args = ap.parse_args()

    overrides = {k: v for k, v in {
        "steps": args.steps,
        "eps": args.eps / 255 if args.eps is not None else None,
        "h264_prob": 0.0 if args.no_h264_eot else None,
    }.items() if v is not None}
    cfg = VideoProtectConfig(
        preset=args.preset, key_interval=args.key_interval, batch_size=args.batch_size, crop_max=args.crop_max,
        detector=args.detector, temporal=args.shared_pattern, identity=args.identity, crf=args.crf, watermark=args.watermark,
        owner=args.owner or getpass.getuser(), protect_overrides=overrides,
    )
    if args.residual_ratio is not None:
        cfg.residual_ratio = args.residual_ratio
    rep = protect_video(args.input, args.output, cfg, vae_ids=args.vae or [DEFAULT_VAE], device=args.device,
                        keep_audio=args.keep_audio)

    i, o = rep["input"], rep["output"]
    print(f"\nInput : {i['width']}x{i['height']} @ {i['fps']} fps, {i['frames']} frame, {i['duration_s']} s, audio={i['has_audio']}")
    print(f"Output: {o['width']}x{o['height']} @ {o['fps']} fps, {o['frames']} frame, {o['duration_s']} s, audio={o['has_audio']}")
    print(f"Wajah : {len(rep['tracks'])} track, {rep['frames_with_faces']} frame berwajah, {rep['keyframes_total']} keyframe dioptimasi")
    if not rep["tracks"]:
        print("[!] Tidak ada wajah terdeteksi: video hanya di-encode ulang, TIDAK ada perlindungan.")
    for t in rep["tracks"]:
        print(f"   track {t['id']}: frame {t['first_frame']}-{t['last_frame']}, crop {t['crop_size']}px, "
              f"jarak-latent akhir {t['final_latent_loss_mean']}, identitas ArcFace {t['final_identity_cos_mean']}")
    print("Waktu : " + ", ".join(f"{k} {v}s" for k, v in rep["timings_s"].items()))
    for w in rep["warnings"]:
        print(f"[!] {w}")
    print(f"Hasil : {rep['output_path']}\nManifest: {rep['manifest']}")
    if rep["audio_file"]:
        print(f"Audio : {rep['audio_file']}")


if __name__ == "__main__":
    main()
