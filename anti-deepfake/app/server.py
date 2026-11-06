#!/usr/bin/env python3
"""Aplikasi web demo: upload foto/video → proses perlindungan → lihat & download hasilnya.

Jalankan (dari folder anti-deepfake):
    pip install fastapi uvicorn python-multipart
    python app/server.py                 # lalu buka http://localhost:8000

Pengaturan lewat environment variable:
    ANTIDEEPFAKE_VAE     VAE yang diserang, dipisah koma (default: stabilityai/sd-vae-ft-mse)
    ANTIDEEPFAKE_DEVICE  auto / cuda / mps / cpu (default: auto)
    ANTIDEEPFAKE_PRESET  fast / balanced / strong (default: balanced)
    ANTIDEEPFAKE_DATA    folder penyimpanan job (default: app_data/)
    PORT                 port server (default: 8000)

Ini prototipe Tahap 4: satu job diproses sekaligus (antrean), tanpa login, file
disimpan lokal. Jangan dibuka ke internet tanpa autentikasi & batas ukuran upload.
"""

from __future__ import annotations

import os
import shutil
import sys
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI, File, HTTPException, UploadFile  # noqa: E402
from fastapi.responses import FileResponse, HTMLResponse  # noqa: E402

from antideepfake.photoguard import DEFAULT_VAE  # noqa: E402

VAES = [v.strip() for v in os.environ.get("ANTIDEEPFAKE_VAE", DEFAULT_VAE).split(",") if v.strip()]
DEVICE = os.environ.get("ANTIDEEPFAKE_DEVICE", "auto")
PRESET = os.environ.get("ANTIDEEPFAKE_PRESET", "balanced")
DATA = Path(os.environ.get("ANTIDEEPFAKE_DATA", ROOT / "app_data"))
MAX_BYTES = 300 * 1024 * 1024
PHOTO_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"}
# bobot tiap tahap video untuk progress keseluruhan
VIDEO_STAGES = {"1/4": (0.0, 0.10), "2/4": (0.10, 0.15), "3/4": (0.15, 0.92), "4/4": (0.92, 1.0)}

app = FastAPI(title="Anti-Deepfake Demo")
jobs: dict[str, dict] = {}
lock = threading.Lock()
worker = ThreadPoolExecutor(max_workers=1)  # satu job sekaligus: model besar & GPU tidak rebutan


def update(job_id: str, **kw) -> None:
    with lock:
        jobs[job_id].update(kw)


def run_job(job_id: str) -> None:
    job = jobs[job_id]
    src, kind = Path(job["input"]), job["kind"]
    update(job_id, state="running", stage="memuat model…", started=time.time())
    try:
        if kind == "photo":
            from antideepfake.pipeline import protect_photo_file

            def prog(i, n, loss):
                update(job_id, progress=i / n, stage=f"optimasi perlindungan ({i}/{n})")

            rep = protect_photo_file(src, src.parent / "protected.png", preset=PRESET, owner="demo",
                                     vae_ids=VAES, device=DEVICE, progress=prog)
            att = rep["attack"]
            summary = {
                "Wajah terdeteksi": rep["faces_detected"],
                "PSNR (asli vs terlindungi)": f"{rep['imperceptibility']['psnr_db']} dB",
                "SSIM": rep["imperceptibility"]["ssim"],
                "Perubahan piksel maks": f"{rep['imperceptibility']['linf_0_255']}/255",
                "Jarak latent VAE (1 = tak berefek)": round(att["final_loss"], 3),
                "Kemiripan wajah ArcFace (rendah = bagus)": None if att.get("final_identity_cos") is None
                else round(att["final_identity_cos"], 3),
                "Watermark terbaca": rep["watermark"]["owner_match"] if rep["watermark"] else None,
            }
            out = rep["output"]
        else:
            from antideepfake.protect_video import VideoProtectConfig, protect_video

            def vprog(desc, done, total):
                key = desc[:3]
                a, b = VIDEO_STAGES.get(key, (0, 1))
                frac = done / total if total else 0
                update(job_id, progress=a + (b - a) * min(1.0, frac), stage=f"{desc} ({done}/{total})")

            rep = protect_video(src, src.parent / "protected.mp4", VideoProtectConfig(preset=PRESET, owner="demo"),
                                vae_ids=VAES, device=DEVICE, show_progress=False, on_progress=vprog)
            i, o = rep["input"], rep["output"]
            summary = {
                "Resolusi / fps": f"{o['width']}x{o['height']} @ {o['fps']} (asli {i['width']}x{i['height']} @ {i['fps']})",
                "Frame / durasi": f"{o['frames']} frame, {o['duration_s']} s",
                "Audio": "ada" if o["has_audio"] else "tidak ada",
                "Wajah (track)": len(rep["tracks"]),
                "Frame berwajah": rep["frames_with_faces"],
                "Keyframe dioptimasi": rep["keyframes_total"],
                "Kemiripan wajah ArcFace di keyframe (rendah = bagus)": ", ".join(
                    str(t["final_identity_cos_mean"]) for t in rep["tracks"]) or "-",
                "Peringatan": "; ".join(rep["warnings"]) or "-",
            }
            if not rep["tracks"]:
                summary["Peringatan"] = "Tidak ada wajah terdeteksi: video hanya di-encode ulang, TIDAK terlindungi."
            out = rep["output_path"]
        update(job_id, state="done", progress=1.0, stage="selesai", output=out,
               summary=summary, seconds=round(time.time() - job["started"], 1))
    except Exception as e:  # tampilkan error ke UI, jangan matikan server
        traceback.print_exc()
        update(job_id, state="error", stage="gagal", error=f"{type(e).__name__}: {e}")


@app.post("/api/jobs")
async def create_job(file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    if ext in PHOTO_EXT:
        kind = "photo"
    elif ext in VIDEO_EXT:
        kind = "video"
    else:
        raise HTTPException(400, f"Format tidak didukung: {ext or '(tanpa ekstensi)'}")
    job_id = uuid.uuid4().hex[:12]
    d = DATA / job_id
    d.mkdir(parents=True, exist_ok=True)
    dst = d / f"original{ext}"
    size = 0
    with open(dst, "wb") as f:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > MAX_BYTES:
                f.close()
                shutil.rmtree(d, ignore_errors=True)
                raise HTTPException(413, "File terlalu besar (maks 300 MB).")
            f.write(chunk)
    with lock:
        ahead = sum(1 for j in jobs.values() if j["state"] in ("queued", "running"))
        jobs[job_id] = {"id": job_id, "kind": kind, "name": file.filename, "input": str(dst), "state": "queued",
                        "stage": f"menunggu antrean ({ahead} job di depan)" if ahead else "menunggu",
                        "progress": 0.0, "created": time.time()}
    worker.submit(run_job, job_id)
    return {"id": job_id, "kind": kind}


def _public(job: dict) -> dict:
    return {k: v for k, v in job.items() if k not in ("input", "output")}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job tidak ditemukan")
    return _public(jobs[job_id])


@app.get("/api/jobs/{job_id}/original")
def get_original(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404)
    return FileResponse(jobs[job_id]["input"])


@app.get("/api/jobs/{job_id}/result")
def get_result(job_id: str, download: bool = False):
    job = jobs.get(job_id)
    if not job or job["state"] != "done":
        raise HTTPException(404, "Hasil belum tersedia")
    out = Path(job["output"])
    name = f"{Path(job['name']).stem}_protected{out.suffix}"
    return FileResponse(out, filename=name if download else None)


@app.get("/api/config")
def config():
    return {"vae": VAES, "device": DEVICE, "preset": PRESET}


@app.get("/", response_class=HTMLResponse)
def index():
    return (Path(__file__).parent / "index.html").read_text(encoding="utf-8")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", 8000)))
