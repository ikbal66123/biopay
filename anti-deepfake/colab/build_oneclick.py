#!/usr/bin/env python3
"""Buat notebook Colab "1 klik" yang berisi SELURUH kode aplikasi (tanpa clone GitHub / token).

    python colab/build_oneclick.py          # menulis colab/anti_deepfake_1klik.ipynb

Kode diambil dari file yang dilacak git di folder anti-deepfake (tanpa tests/ & colab/),
dikemas tar.gz + base64 ke dalam satu sel. Jalankan ulang setelah kode berubah.
"""

from __future__ import annotations

import base64
import io
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "colab" / "anti_deepfake_1klik.ipynb"


def bundle() -> tuple[str, str]:
    files = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
    files = [f for f in files if not f.startswith(("tests/", "colab/", "examples/")) and f != "pytest.ini"]
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for f in sorted(files):
            info = tar.gettarinfo(str(ROOT / f), arcname=f"anti-deepfake/{f}")
            info.mtime, info.uid, info.gid, info.uname, info.gname = 0, 0, 0, "", ""
            with open(ROOT / f, "rb") as fh:
                tar.addfile(info, fh)
    rev = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    return base64.b64encode(buf.getvalue()).decode(), rev


MAIN = r'''#@title ▶ Klik tombol play di kiri ini (atau Runtime → Run all), lalu tunggu link muncul { display-mode: "form" }
PRESET = "balanced"  #@param ["fast", "balanced", "strong"]
import base64, io, os, re, subprocess, sys, tarfile, time, urllib.request
from IPython.display import HTML, display, clear_output

def say(msg):
    print(msg, flush=True)

def sh(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout[-2000:], r.stderr[-2000:])
        raise SystemExit(f"❌ Perintah gagal: {cmd}")
    return r.stdout

# 1) GPU
import torch
if torch.cuda.is_available():
    say(f"✅ 1/5 GPU aktif: {torch.cuda.get_device_name(0)}")
    DEVICE = "cuda"
else:
    DEVICE = "cpu"
    display(HTML("<h3 style='color:#c62828'>⚠️ GPU belum aktif — aplikasi tetap jalan tapi SANGAT lambat.</h3>"
                 "<p>Untuk GPU: menu <b>Runtime → Change runtime type → T4 GPU → Save</b>, lalu klik play lagi.</p>"))

# 2) Kode aplikasi (tertanam di notebook ini, tidak perlu GitHub)
APP = "/content/anti-deepfake"
if (open(f"{APP}/.version").read().strip() if os.path.exists(f"{APP}/.version") else "") != CODE_VERSION:
    subprocess.run(f"rm -rf {APP}", shell=True)  # kode lama dari sesi sebelumnya -> ganti
    with tarfile.open(fileobj=io.BytesIO(base64.b64decode(CODE)), mode="r:gz") as t:
        t.extractall("/content", filter="data")
    open(f"{APP}/.version", "w").write(CODE_VERSION)
os.chdir(APP)
say(f"✅ 2/5 Kode aplikasi siap (versi {CODE_VERSION})")

# 3) Library (PyTorch+CUDA sudah ada di Colab)
# Pasang ulang bila versi kode berbeda ATAU ada modul yang belum ada (mis. sesi lama).
NEEDED = ["diffusers", "insightface", "onnx2torch", "open_clip", "imwatermark", "fastapi", "uvicorn", "multipart"]
missing = [m for m in NEEDED if subprocess.run([sys.executable, "-c", f"import {m}"], capture_output=True).returncode]
marker = f"/content/.adf_installed_{CODE_VERSION}"
if missing or not os.path.exists(marker):
    if missing:
        say(f"   modul belum ada: {', '.join(missing)}")
    say("⏳ 3/5 Memasang library (±3–6 menit, sekali per sesi)…")
    sh(f"{sys.executable} -m pip install -q diffusers transformers accelerate scikit-image tqdm "
       "insightface onnxruntime-gpu onnx2torch open_clip_torch fastapi uvicorn python-multipart")
    sh(f"{sys.executable} -m pip install -q --no-deps invisible-watermark")
    ok = subprocess.run([sys.executable, "-c", "import cv2; assert hasattr(cv2, 'CascadeClassifier')"]).returncode == 0
    if not ok:  # insightface kadang menarik OpenCV 5 (tanpa Haar cascade)
        subprocess.run(f"{sys.executable} -m pip uninstall -y -q opencv-python opencv-python-headless opencv-contrib-python", shell=True)
        sh(f"{sys.executable} -m pip install -q 'opencv-python-headless<5'")
    if subprocess.run("which ffmpeg", shell=True).returncode != 0:
        sh("apt-get -qq install -y ffmpeg")
    open(marker, "w").close()
    still = [m for m in NEEDED if subprocess.run([sys.executable, "-c", f"import {m}"], capture_output=True).returncode]
    if still:
        raise SystemExit(f"❌ Library gagal terpasang: {', '.join(still)}. Coba Runtime → Disconnect and delete runtime, lalu Run all.")
say("✅ 3/5 Library terpasang")

# 4) Nyalakan aplikasi (model diunduh otomatis saat pertama dipakai)
PORT = 8000
subprocess.run("pkill -f 'app/server.py'; pkill -f cloudflared", shell=True)
time.sleep(1)
say("⏳ 4/5 Mengunduh model AI (VAE SD1.5+SDXL, CLIP ViT-L/14, SigLIP, ArcFace) & menyalakan aplikasi (±3–6 menit)…")
warm = subprocess.run([sys.executable, "-c",
    "import sys; sys.path.insert(0,'.');"
    "from antideepfake.pipeline import get_vaes, get_embedders, ENSEMBLE_VAES, ENSEMBLE_EMBEDDERS;"
    "import torch; d=torch.device('cpu'); get_vaes(ENSEMBLE_VAES, d, strict=False); get_embedders(ENSEMBLE_EMBEDDERS, d, strict=False);"
    "from antideepfake.faces import FaceDetector; FaceDetector('insightface');"
    "from antideepfake.identity_attack import ArcFaceTorch; ArcFaceTorch('cpu')"], capture_output=True, text=True)
if warm.returncode != 0:
    print(warm.stderr[-3000:]); raise SystemExit("❌ Gagal mengunduh model (lihat pesan di atas)")
env = dict(os.environ, ANTIDEEPFAKE_DEVICE=DEVICE, ANTIDEEPFAKE_PRESET=PRESET,
           ANTIDEEPFAKE_DATA="/content/app_data", HOST="127.0.0.1", PORT=str(PORT))
server = subprocess.Popen([sys.executable, "app/server.py"], env=env,
                          stdout=open("/content/server.log", "w"), stderr=subprocess.STDOUT)
for _ in range(90):
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/config", timeout=2); break
    except Exception:
        if server.poll() is not None:
            print(open("/content/server.log").read()[-3000:]); raise SystemExit("❌ Aplikasi gagal menyala")
        time.sleep(1)
say("✅ 4/5 Aplikasi menyala")

# 5) Link publik (Cloudflare Quick Tunnel, gratis tanpa akun)
if not os.path.exists("/content/cloudflared"):
    urllib.request.urlretrieve("https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
                               "/content/cloudflared")
    os.chmod("/content/cloudflared", 0o755)
subprocess.Popen(["/content/cloudflared", "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{PORT}"],
                 stdout=open("/content/tunnel.log", "w"), stderr=subprocess.STDOUT)
url = None
for _ in range(60):
    m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", open("/content/tunnel.log").read())
    if m:
        url = m.group(0); break
    time.sleep(1)
backup = None
try:
    from google.colab.output import eval_js
    backup = eval_js(f"google.colab.kernel.proxyPort({PORT})")
except Exception:
    pass
time.sleep(4)
html = "<div style='font-family:system-ui;padding:16px;border:2px solid #2f6fed;border-radius:12px'>"
if url:
    html += (f"<h2>✅ 5/5 Aplikasi siap! Buka: <a href='{url}' target='_blank'>{url}</a></h2>"
             "<p>Bisa dibuka dari HP juga. Kalau muncul error, tunggu 20 detik lalu refresh.</p>")
if backup:
    html += f"<p>Link cadangan (hanya di browser yang login akun Google ini): <a href='{backup}' target='_blank'>{backup}</a></p>"
html += ("<p>⚠️ Biarkan tab Colab ini tetap terbuka. Jangan sebar link-nya: siapa pun yang punya link bisa memakai "
         "aplikasimu. Semua file hilang saat sesi Colab berakhir.</p></div>")
display(HTML(html))
'''


def main() -> None:
    code_b64, rev = bundle()
    cells = [
        {"cell_type": "markdown", "metadata": {}, "source": [
            "# 🛡️ Anti-Deepfake — versi 1 klik\n",
            "\n",
            "**Cara pakai (3 langkah):**\n",
            "1. Menu **Runtime → Run all** (atau tekan `Ctrl+F9`). Kalau muncul peringatan, klik **Run anyway**.\n",
            "2. Tunggu ±5–10 menit sampai muncul kotak biru **\"Aplikasi siap! Buka: https://…\"**.\n",
            "3. Klik link itu (bisa juga dibuka di HP) → upload foto/video → **Download hasil**.\n",
            "\n",
            "Tidak perlu akun GitHub atau token: seluruh kode aplikasi sudah ada di dalam notebook ini.\n",
            "Kalau muncul tulisan *GPU belum aktif*: menu **Runtime → Change runtime type → T4 GPU → Save**, lalu ulangi langkah 1.\n"]},
        {"cell_type": "code", "metadata": {"cellView": "form"}, "execution_count": None, "outputs": [],
         "source": MAIN.splitlines(keepends=True)},
        {"cell_type": "code", "metadata": {"cellView": "form"}, "execution_count": None, "outputs": [],
         "source": ["#@title (Kalau ada masalah) lihat log { display-mode: \"form\" }\n",
                    "for f in ['/content/server.log', '/content/tunnel.log']:\n",
                    "    print('=====', f); print(''.join(open(f).readlines()[-30:]) if os.path.exists(f) else '(belum ada)')\n"]},
        {"cell_type": "code", "metadata": {"cellView": "form", "jupyter": {"source_hidden": True}},
         "execution_count": None, "outputs": [],
         "source": ["#@title (kode aplikasi tertanam — tidak perlu dibuka) { display-mode: \"form\" }\n",
                    f"CODE_VERSION = {rev!r}\n",
                    f"CODE = {code_b64!r}\n"]},
    ]
    # Sel kode tertanam harus jalan lebih dulu: taruh sebelum sel utama.
    cells = [cells[0], cells[3], cells[1], cells[2]]
    nb = {"nbformat": 4, "nbformat_minor": 0,
          "metadata": {"colab": {"provenance": [], "gpuType": "T4"}, "accelerator": "GPU",
                       "kernelspec": {"name": "python3", "display_name": "Python 3"},
                       "language_info": {"name": "python"}},
          "cells": cells}
    OUT.write_text(json.dumps(nb, indent=1, ensure_ascii=False))
    print(f"ditulis: {OUT} ({OUT.stat().st_size // 1024} KB, kode versi {rev})")


if __name__ == "__main__":
    main()
