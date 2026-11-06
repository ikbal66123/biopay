#!/usr/bin/env python3
"""Uji perlindungan VIDEO: asli vs terlindungi, sebelum & sesudah kompresi ala TikTok.

Langkah:
 1. Kompres video asli & terlindungi seperti TikTok (H.264, <=1080p, bitrate rendah).
 2. Kualitas visual: PSNR per frame (semua frame), SSIM (sampel), dan "flicker"
    (perubahan antar-frame tambahan yang ditimbulkan perlindungan).
 3. Di frame sampel, untuk kondisi "mentah" dan "terkompresi":
    - vae      : seberapa jauh encoder VAE tertipu (latent shift).
    - identity : apakah pengenal wajah (ArcFace) masih mengenali wajah di video terlindungi.
    - img2img  : Stable Diffusion img2img pada frame asli vs terlindungi; identitas wajah
                 di hasil edit dibandingkan dengan wajah asli (cosine, makin rendah makin bagus).
    - swap     : InsightFace inswapper: identitas dari frame asli vs terlindungi ditempel ke
                 gambar target; identitas hasil swap dibandingkan dengan wajah asli.
 4. Simpan perbandingan side-by-side (video + gambar) dan report.json.

Contoh:
    python scripts/test_video.py videoku.mp4 videoku_protected.mp4
    python scripts/test_video.py videoku.mp4 videoku_protected.mp4 --attacks vae,identity,img2img
    python scripts/test_video.py videoku.mp4 videoku_protected.mp4 --attacks vae,identity,swap \\
        --swap-model models/inswapper_128.onnx --swap-target target.jpg
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from antideepfake.device import pick_device  # noqa: E402
from antideepfake.evaluation import to_work, vae_metrics  # noqa: E402
from antideepfake.imageio import load_rgb, save_rgb  # noqa: E402
from antideepfake.metrics import psnr, ssim  # noqa: E402
from antideepfake.photoguard import DEFAULT_VAE, load_vae  # noqa: E402
from antideepfake.videoio import VideoWriter, iter_frames, probe, transcode  # noqa: E402

# Perkiraan pengaturan upload. TikTok tidak mempublikasikan angka pastinya; video 1080p
# yang diunduh ulang umumnya H.264 ~1-3 Mbps. "tiktok_low" mensimulasikan kasus terburuk.
PROFILES = {
    "tiktok": dict(max_side=1920, bitrate="2M"),
    "tiktok_low": dict(max_side=1280, bitrate="800k"),
    "whatsapp": dict(max_side=848, bitrate="1M"),
}


def read_frames_at(path: Path, indices: list[int]) -> dict[int, np.ndarray]:
    want, out = set(indices), {}
    for i, f in enumerate(iter_frames(path)):
        if i in want:
            out[i] = f.copy()
            if len(out) == len(want):
                break
    return out


def quality_pass(orig: Path, prot: Path, ssim_every: int) -> dict:
    """PSNR semua frame, SSIM tiap `ssim_every` frame, dan flicker temporal."""
    from tqdm.auto import tqdm

    n = probe(orig).n_frames
    psnrs, ssims, flick, mags = [], [], [], []
    prev = None
    for i, (o, p) in enumerate(tqdm(zip(iter_frames(orig), iter_frames(prot)), total=n, desc="kualitas visual", unit="frame")):
        if o.shape != p.shape:
            raise SystemExit("Resolusi video asli dan terlindungi berbeda.")
        v = psnr(o, p)
        psnrs.append(min(v, 100.0))
        if i % ssim_every == 0:
            ssims.append(ssim(o, p))
        r = p.astype(np.float32) - o.astype(np.float32)  # residual = perturbasi yang benar-benar ada
        if prev is not None:
            area = (np.abs(r) > 0) | (np.abs(prev) > 0)
            if area.any():
                flick.append(float(np.abs(r - prev)[area].mean()))
                mags.append(float(np.abs(r)[area].mean()))
        prev = r
    psnrs = np.array(psnrs)
    return {
        "frames": len(psnrs),
        "psnr_mean_db": round(float(psnrs.mean()), 2),
        "psnr_min_db": round(float(psnrs.min()), 2),
        "psnr_p5_db": round(float(np.percentile(psnrs, 5)), 2),
        "ssim_mean": round(float(np.mean(ssims)), 4),
        "ssim_min": round(float(np.min(ssims)), 4),
        "perturbation_mean_abs_0_255": round(float(np.mean(mags)), 3) if mags else 0.0,
        "flicker_mean_abs_0_255": round(float(np.mean(flick)), 3) if flick else 0.0,
        # 0 = pola stabil; ~1.3-1.4 = pola acak baru di tiap frame (kedip maksimal)
        "flicker_ratio": round(float(np.mean(flick) / max(np.mean(mags), 1e-6)), 3) if flick else 0.0,
    }


def side_by_side(a: Path, b: Path, dst: Path, labels=("ASLI", "TERLINDUNGI", "SELISIH x10")) -> None:
    def txt(t):
        return f"drawtext=text='{t}':x=10:y=10:fontsize=h/30:fontcolor=white:box=1:boxcolor=black@0.6"

    fc = "[0:v]format=gbrp,split[a0][a1];[1:v]format=gbrp,split[b0][b1];"
    fc += ("[a1][b1]blend=all_mode=difference,lut=c0=val*10:c1=val*10:c2=val*10[d];"
           f"[a0]{txt(labels[0])}[l0];[b0]{txt(labels[1])}[l1];[d]{txt(labels[2])}[l2];"
           "[l0][l1][l2]hstack=inputs=3,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[v]")
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(a), "-i", str(b), "-filter_complex", fc, "-map", "[v]",
           "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-c:a", "aac", str(dst)]
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError:  # FFmpeg tanpa drawtext (libfreetype): tanpa label
        cmd[cmd.index(fc)] = fc.replace(f"{txt(labels[0])}", "null").replace(f"{txt(labels[1])}", "null") \
            .replace(f"{txt(labels[2])}", "null")
        subprocess.run(cmd, check=True)


def label_tile(img: np.ndarray, text: str, h: int = 256) -> np.ndarray:
    from PIL import Image, ImageDraw

    s = h / img.shape[0]
    im = Image.fromarray(img).resize((max(1, int(img.shape[1] * s)), h), Image.LANCZOS)
    canvas = Image.new("RGB", (im.width, h + 22), "white")
    canvas.paste(im, (0, 22))
    ImageDraw.Draw(canvas).text((4, 4), text[:40], fill="black")
    return np.asarray(canvas)


def blank_like(h: int = 256, text: str = "tidak ada wajah") -> np.ndarray:
    img = np.full((h, h, 3), 220, np.uint8)
    return label_tile(img, text, h)[22:]


def hcat(tiles: list[np.ndarray]) -> np.ndarray:
    h = max(t.shape[0] for t in tiles)
    tiles = [np.pad(t, ((0, h - t.shape[0]), (0, 4), (0, 0)), constant_values=255) for t in tiles]
    return np.concatenate(tiles, 1)


def vcat(rows: list[np.ndarray]) -> np.ndarray:
    w = max(r.shape[1] for r in rows)
    rows = [np.pad(r, ((0, 4), (0, w - r.shape[1]), (0, 0)), constant_values=255) for r in rows]
    return np.concatenate(rows, 0)


def rows_to_video(rows: list[np.ndarray], dst: Path, fps: float = 1.0) -> None:
    from antideepfake.videoio import VideoWriter

    h = max(r.shape[0] for r in rows) // 2 * 2
    w = max(r.shape[1] for r in rows) // 2 * 2
    with VideoWriter(dst, w, h, f"{int(fps)}/1", crf=18, preset="veryfast") as wr:
        for r in rows:
            r = np.pad(r, ((0, max(0, h - r.shape[0])), (0, max(0, w - r.shape[1])), (0, 0)), constant_values=255)
            wr.write(np.ascontiguousarray(r[:h, :w]))


def mean(xs):
    xs = [x for x in xs if x is not None]
    return round(float(np.mean(xs)), 4) if xs else None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("original")
    ap.add_argument("protected")
    ap.add_argument("--out-dir", default="video_eval")
    ap.add_argument("--profile", default="tiktok", choices=list(PROFILES))
    ap.add_argument("--samples", type=int, default=8, help="jumlah frame sampel untuk uji AI")
    ap.add_argument("--attacks", default="vae,identity", help="kombinasi: vae,identity,img2img,swap")
    ap.add_argument("--vae", action="append",
                    help=f"VAE untuk uji 'vae', bisa diulang untuk uji transfer (default: {DEFAULT_VAE})")
    ap.add_argument("--sd-model", default="stable-diffusion-v1-5/stable-diffusion-v1-5")
    ap.add_argument("--prompt", default="news photo of a man caught stealing a chicken at a night market, realistic")
    ap.add_argument("--strength", type=float, default=0.5)
    ap.add_argument("--inference-steps", type=int, default=30)
    ap.add_argument("--guidance", type=float, default=7.5)
    ap.add_argument("--swap-model", help="path inswapper_128.onnx")
    ap.add_argument("--swap-target", help="gambar target berwajah (orang lain) untuk face swap")
    ap.add_argument("--device", default="auto")
    args = ap.parse_args()

    attacks = {a.strip() for a in args.attacks.split(",") if a.strip()}
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    device = pick_device(args.device)
    orig, prot = Path(args.original), Path(args.protected)
    io, ip = probe(orig), probe(prot)
    report: dict = {"profile": {args.profile: PROFILES[args.profile]}, "attacks": sorted(attacks),
                    "input": {"frames": io.n_frames, "size": f"{io.width}x{io.height}", "fps": io.fps_str},
                    "protected": {"frames": ip.n_frames, "size": f"{ip.width}x{ip.height}", "fps": ip.fps_str,
                                  "duration_s": round(ip.duration, 3), "has_audio": ip.has_audio}}

    # 1. kompresi ala platform
    print(f"==> Kompres ulang ({args.profile}: {PROFILES[args.profile]})")
    orig_c = transcode(orig, out / f"original_{args.profile}.mp4", **PROFILES[args.profile])
    prot_c = transcode(prot, out / f"protected_{args.profile}.mp4", **PROFILES[args.profile])

    # 2. kualitas visual. Baseline: video asli yang HANYA di-encode ulang dengan pengaturan
    # yang sama seperti protect_video (CRF 14), supaya efek encode ulang bisa dipisahkan
    # dari efek perlindungan.
    print("==> Kualitas visual asli vs terlindungi")
    base = out / "original_reencoded.mp4"
    with VideoWriter(base, io.width, io.height, io.fps, crf=14, preset="slow") as wr:
        for f in iter_frames(orig, io):
            wr.write(f)
    report["visual_quality_baseline_reencode_only"] = quality_pass(orig, base, ssim_every=max(1, io.n_frames // 60))
    report["visual_quality"] = quality_pass(orig, prot, ssim_every=max(1, io.n_frames // 60))
    report["visual_quality_after_compression"] = quality_pass(orig_c, prot_c, ssim_every=max(1, io.n_frames // 60))
    side_by_side(orig, prot, out / "side_by_side_raw.mp4")
    side_by_side(orig_c, prot_c, out / f"side_by_side_{args.profile}.mp4")

    # 3. uji AI pada frame sampel
    n = min(io.n_frames, ip.n_frames)
    idx = sorted({int(round(x)) for x in np.linspace(0, n - 1, min(args.samples, n))})
    frames = {
        "raw": (read_frames_at(orig, idx), read_frames_at(prot, idx)),
        args.profile: (read_frames_at(orig_c, idx), read_frames_at(prot_c, idx)),
    }
    ref_frames = frames["raw"][0]

    vaes = {}
    if "vae" in attacks:
        for vid in args.vae or [DEFAULT_VAE]:
            vaes[Path(vid).name.replace("_encoder.pth", "") if vid.startswith("taesd:") else vid] = load_vae(vid, device)
    ident = None
    if attacks & {"identity", "img2img", "swap"}:
        try:
            from antideepfake.evaluation import IdentityModel

            ident = IdentityModel()
        except ImportError:
            print("[!] insightface tidak terpasang: metrik identitas dilewati (pip install insightface onnxruntime)")
    img2img = None
    if "img2img" in attacks:
        from antideepfake.evaluation import Img2ImgAttacker

        img2img = Img2ImgAttacker(args.sd_model, device, args.prompt, args.strength, args.inference_steps, args.guidance)
    swap = None
    if "swap" in attacks:
        if not (args.swap_model and args.swap_target):
            raise SystemExit("Uji swap butuh --swap-model inswapper_128.onnx dan --swap-target gambar.jpg")
        from antideepfake.evaluation import FaceSwapAttacker

        swap = FaceSwapAttacker(args.swap_model, load_rgb(args.swap_target))

    refs = {i: (ident.embed(ref_frames[i]) if ident else None) for i in idx}
    from tqdm.auto import tqdm

    report["conditions"] = {}
    for cond, (fo, fp) in frames.items():
        per = []
        rows = []
        for i in tqdm(idx, desc=f"uji AI [{cond}]", unit="frame"):
            o, p = fo[i], fp[i]
            e: dict = {"frame": i}
            tiles = [label_tile(o, f"asli #{i} [{cond}]"), label_tile(p, "terlindungi"),
                     label_tile(np.clip(np.abs(o.astype(int) - p.astype(int)) * 10, 0, 255).astype(np.uint8), "selisih x10")]
            for vname, vae in vaes.items():
                m, ro, rp = vae_metrics(vae, to_work(o, 512), to_work(p, 512), device)
                if ident is not None:  # apakah wajah masih dikenali setelah encode->decode VAE?
                    m["id_recon_original"] = ident.similarity(refs[i], ident.embed(ro))
                    m["id_recon_protected"] = ident.similarity(refs[i], ident.embed(rp))
                e.setdefault("vae", {})[vname] = m
                if vname == next(iter(vaes)):
                    tiles += [label_tile(ro, f"VAE({vname}) asli"), label_tile(rp, f"VAE({vname}) terlindungi")]
            if ident is not None:
                e["id_direct_original"] = ident.similarity(refs[i], ident.embed(o))
                e["id_direct_protected"] = ident.similarity(refs[i], ident.embed(p))
            if img2img is not None:
                eo, ep = img2img(o), img2img(p)
                e["img2img"] = {"id_fake_from_original": ident.similarity(refs[i], ident.embed(eo)) if ident else None,
                                "id_fake_from_protected": ident.similarity(refs[i], ident.embed(ep)) if ident else None,
                                "ssim_fake_o_vs_fake_p": round(ssim(eo, ep), 4)}
                tiles += [label_tile(eo, "img2img dari asli"), label_tile(ep, "img2img dari terlindungi")]
            if swap is not None:
                so, sp = swap(o), swap(p)
                e["swap"] = {"id_fake_from_original": ident.similarity(refs[i], ident.embed(so)) if so is not None else None,
                             "id_fake_from_protected": ident.similarity(refs[i], ident.embed(sp)) if sp is not None else None,
                             "source_face_found_original": so is not None, "source_face_found_protected": sp is not None}
                tiles += [label_tile(so, "swap dari asli") if so is not None else blank_like(),
                          label_tile(sp, "swap dari terlindungi") if sp is not None else blank_like()]
            per.append(e)
            rows.append(hcat(tiles))
        grid = vcat(rows)
        save_rgb(grid, out / f"comparison_{cond}.png")
        rows_to_video(rows, out / f"comparison_{cond}.mp4")

        agg: dict = {"frames": per}
        for vname in vaes:
            ms = [x["vae"][vname] for x in per]
            agg.setdefault("vae", {})[vname] = {k: mean([m.get(k) for m in ms]) for k in
                                                ("latent_shift", "target_distance_rel", "recon_psnr_original_db",
                                                 "recon_psnr_protected_db", "id_recon_original", "id_recon_protected")}
        if ident is not None:
            agg["id_direct_protected_mean"] = mean([x["id_direct_protected"] for x in per])
        for atk in ("img2img", "swap"):
            if any(atk in x for x in per):
                agg[f"{atk}_id_from_original_mean"] = mean([x[atk]["id_fake_from_original"] for x in per])
                agg[f"{atk}_id_from_protected_mean"] = mean([x[atk]["id_fake_from_protected"] for x in per])
        report["conditions"][cond] = agg

    # perlindungan yang tersisa setelah kompresi
    raw, comp = report["conditions"]["raw"], report["conditions"][args.profile]
    remain = {}
    for vname in vaes:
        r, c = raw["vae"][vname], comp["vae"][vname]
        # efek = 1 - target_distance_rel (0 = tidak ada efek). Sisa = efek setelah / efek sebelum kompresi.
        er, ec = 1 - r["target_distance_rel"], 1 - c["target_distance_rel"]
        remain[f"vae_{vname}_target_effect"] = round(ec / er, 3) if er > 1e-3 else None
        if r.get("id_recon_protected") is not None and c.get("id_recon_protected") is not None:
            dr = r["id_recon_original"] - r["id_recon_protected"]
            dc = c["id_recon_original"] - c["id_recon_protected"]
            remain[f"vae_{vname}_identity_drop"] = round(dc / dr, 3) if abs(dr) > 1e-3 else None
    for atk in ("img2img", "swap"):
        k_o, k_p = f"{atk}_id_from_original_mean", f"{atk}_id_from_protected_mean"
        if raw.get(k_o) is not None and raw.get(k_p) is not None and comp.get(k_p) is not None:
            drop_raw = raw[k_o] - raw[k_p]
            drop_c = comp[k_o] - comp[k_p]
            remain[f"{atk}_identity_drop"] = round(drop_c / drop_raw, 3) if abs(drop_raw) > 1e-3 else None
    report["protection_remaining_after_compression"] = remain
    (out / "report.json").write_text(json.dumps(report, indent=2, default=float))

    # ringkasan
    vq, vqc = report["visual_quality"], report["visual_quality_after_compression"]
    vb = report["visual_quality_baseline_reencode_only"]
    print("\n================ RINGKASAN ================")
    print(f"Baseline encode ulang: PSNR rata2 {vb['psnr_mean_db']} dB, SSIM {vb['ssim_mean']}, "
          f"perubahan antar-frame {vb['flicker_mean_abs_0_255']}")
    print(f"Visual (mentah)      : PSNR rata2 {vq['psnr_mean_db']} dB (min {vq['psnr_min_db']}), SSIM {vq['ssim_mean']}, "
          f"perubahan antar-frame {vq['flicker_mean_abs_0_255']} (flicker ratio {vq['flicker_ratio']})")
    print(f"Visual ({args.profile:12s}): PSNR rata2 {vqc['psnr_mean_db']} dB, SSIM {vqc['ssim_mean']}")
    print("\n| kondisi | ArcFace langsung (terlindungi) | img2img id asli -> terlindungi | swap id asli -> terlindungi |")
    print("|---|---|---|---|")
    for cond, a in report["conditions"].items():
        def pair(atk):
            o, p = a.get(f"{atk}_id_from_original_mean"), a.get(f"{atk}_id_from_protected_mean")
            return f"{o} -> {p}" if o is not None or p is not None else "-"
        print(f"| {cond} | {a.get('id_direct_protected_mean', '-')} | {pair('img2img')} | {pair('swap')} |")
    if vaes:
        print("\n| kondisi | VAE | jarak-ke-target (1=tak berefek) | rekon PSNR asli/terlindungi | id rekon asli -> terlindungi |")
        print("|---|---|---|---|---|")
        for cond, a in report["conditions"].items():
            for vname, m in a["vae"].items():
                print(f"| {cond} | {vname} | {m['target_distance_rel']} | {m['recon_psnr_original_db']} / "
                      f"{m['recon_psnr_protected_db']} | {m['id_recon_original']} -> {m['id_recon_protected']} |")
    print(f"\nPerlindungan tersisa setelah kompresi (1.0 = utuh, 0 = hilang): {remain}")
    print(f"File: {out}/side_by_side_*.mp4, comparison_*.png/.mp4, report.json")


if __name__ == "__main__":
    main()
