# Anti-Deepfake: Perlindungan Foto (Tahap 1) & Video (Tahap 2)

Prototipe untuk melindungi foto dan video pribadi sebelum diupload ke media
sosial, supaya lebih sulit dipakai AI untuk membuat editan palsu (misalnya
wajahmu ditempel ke video "maling ayam").

- **Foto**: `python scripts/protect_photo.py fotoku.jpg`
- **Video**: `python scripts/protect_video.py videoku.mp4`, lihat
  [Tahap 2: Video](#tahap-2-video).
- **Coba di Google Colab (GPU gratis, link publik)**:
  [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/ikbal66123/biopay/blob/claude/bold-allen-vmzjvm/anti-deepfake/colab/anti_deepfake_colab.ipynb)
  (`colab/anti_deepfake_colab.ipynb`; langkah-langkahnya ada di dalam notebook)
- **Aplikasi web demo**: `pip install fastapi uvicorn python-multipart`, lalu
  `python app/server.py` dan buka http://localhost:8000. Upload foto/video →
  progress → hasil berdampingan + angka → download. Satu job diproses sekaligus.
  Pengaturan lewat env `ANTIDEEPFAKE_PRESET` (fast/balanced/strong),
  `ANTIDEEPFAKE_DEVICE`, dan `ANTIDEEPFAKE_VAE` (lihat `app/server.py`).
  Ini prototipe lokal: jangan dibuka ke internet tanpa login & pembatasan.

Cara kerjanya: kamu memasukkan satu foto dan mendapat satu foto baru yang
terlihat sama, tapi isinya sudah:

1. **Diberi "racun" tak terlihat** (*adversarial perturbation*): perubahan
   piksel yang sangat kecil (maksimal ±8 dari 255, lebih kecil lagi di area
   datar seperti kulit dan langit) yang membuat encoder
   Stable Diffusion salah membaca foto, seolah-olah foto itu cuma bidang abu-abu
   atau pola acak. Editor AI berbasis Stable Diffusion lalu menghasilkan gambar
   yang rusak atau tidak mirip kamu.
2. **Diberi "racun" identitas** (anti face-swap, aktif otomatis jika `insightface`
   terpasang): embedding wajah ArcFace dari foto terlindungi dibuat berbeda dari
   wajah aslimu. Embedding ini yang dipakai InsightFace inswapper,
   Roop/FaceFusion, dan banyak aplikasi face swap untuk "mengambil" wajah.
   Lihat `identity_attack.py`.
3. **Diberi watermark tak terlihat** berisi tag pemilik (hash dari ID kamu).
4. **Dicatat dalam manifest JSON**: hash SHA-256 file asli & terlindungi, waktu,
   dan pengaturan, sebagai catatan bukti kepemilikan.

> **Baca bagian [Keterbatasan](#keterbatasan-baca-ini) sebelum mengandalkannya.**
> Ini lapisan perlindungan tambahan, bukan jaminan. Pendekatan ini terbukti di
> riset terhadap model tertentu, tapi mudah melemah terhadap model lain atau
> kompresi berat.

## Cara kerja (singkat)

```
foto asli x ──► cari δ kecil (|δ| ≤ 8/255) ──► x + δ (terlihat sama)
                    │
                    └─ tujuan: Encoder_VAE(x + δ) ≈ Encoder_VAE(gambar abu-abu)
```

Hampir semua editor berbasis Stable Diffusion (img2img, inpainting, banyak
aplikasi "AI edit") mengubah foto menjadi *latent* lewat encoder VAE dulu. Ini
pendekatan **encoder attack** dari PhotoGuard (Salman dkk., MIT, 2023). Kita
mengoptimasi δ dengan PGD (Projected Gradient Descent), ditambah **EOT**
(Expectation over Transformation): di setiap iterasi foto diresize, dikompres
JPEG, diblur, dan diberi noise secara acak, supaya perlindungan tidak langsung
hilang saat platform mengompres ulang foto.

Supaya lebih tak terlihat, batas perubahan dibuat **adaptif**: di area datar
(kulit, dinding, langit) hanya ~35% dari batas, dan penuh di area bertekstur
(rambut, kain), tempat mata manusia sulit melihat noise. Di foto uji, ini
menaikkan PSNR dari ~33,8 dB menjadi ~36 dB.

Watermark (QIM pada koefisien DCT blok 8x8) menambah perubahan maksimal ±4/255,
dengan PSNR sekitar 50 dB.

## Struktur proyek

```
anti-deepfake/
├── antideepfake/            # library (dipakai CLI sekarang, FastAPI nanti)
│   ├── photoguard.py        # inti: PGD batch + EOT (dipakai foto & video), preset, multi-VAE
│   ├── identity_attack.py   # serangan identitas ArcFace (anti face-swap), align diferensiabel
│   ├── augment.py           # EOT: resize, JPEG & H.264 (straight-through), 4:2:0, blur, noise
│   ├── pipeline.py          # alur "satu klik": foto → terlindungi + watermark + manifest
│   ├── protect_video.py     # Tahap 2: deteksi+tracking → keyframe → PGD batch → interpolasi → tulis
│   ├── videoio.py           # FFmpeg: probe, decode/encode lewat pipe, audio, kompresi ala TikTok
│   ├── tracking.py          # pelacakan wajah antar-frame (IoU + EMA + tahan saat deteksi gagal)
│   ├── evaluation.py        # metrik VAE, identitas ArcFace, penyerang img2img & face swap
│   ├── taesd_adapter.py     # encoder ringan TAESD (SD/SDXL/SD3/Flux) untuk uji & ensemble murah
│   ├── watermark.py         # watermark tak terlihat (QIM pada DCT 8x8) berisi tag pemilik
│   ├── manifest.py          # manifest JSON (hash SHA-256, waktu, pengaturan)
│   ├── faces.py             # deteksi wajah (RetinaFace/InsightFace, YuNet, Haar) + mask
│   ├── metrics.py           # PSNR, SSIM, LPIPS (opsional)
│   ├── imageio.py           # baca/tulis gambar, JPEG, resize
│   └── device.py            # pilih CUDA / MPS / CPU
├── app/                     # aplikasi web demo (FastAPI + satu halaman HTML)
├── scripts/
│   ├── protect_photo.py     # lindungi foto
│   ├── evaluate_photo.py    # uji: edit AI pada foto asli vs terlindungi, + kompresi
│   ├── protect_video.py     # lindungi video
│   ├── test_video.py        # uji video: kompres ala TikTok, img2img / face swap, side-by-side
│   └── verify_watermark.py  # cek watermark & cocokkan dengan manifest
├── tests/                   # unit test (VAE kecil acak + video sintetis, tanpa unduhan model)
├── examples/                # taruh foto ujimu di sini (tidak ikut di-commit)
└── requirements.txt
```

## Instalasi

Butuh Python 3.10+ dan, sebaiknya, GPU NVIDIA (≥ 6 GB VRAM untuk perlindungan,
≥ 8 GB untuk uji img2img). CPU dan Apple Silicon (MPS) juga bisa, tapi jauh lebih
lambat (lihat tabel waktu di bawah).

```bash
cd anti-deepfake
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
# 1) pasang PyTorch sesuai GPU kamu, lihat https://pytorch.org/get-started/locally/
pip install torch --index-url https://download.pytorch.org/whl/cu124
# 2) sisanya
pip install -r requirements.txt
# 3) insightface kadang ikut memasang opencv-python 5 yang bentrok; pastikan hanya ini yang terpasang:
pip uninstall -y opencv-python && pip install --force-reinstall --no-deps "opencv-python-headless<5"
```

Untuk video juga perlu **FFmpeg** (dengan libx264): `sudo apt install ffmpeg`,
`brew install ffmpeg`, atau unduh dari ffmpeg.org (Windows).

Model InsightFace `buffalo_l` (~280 MB: detektor RetinaFace + ArcFace) diunduh
otomatis ke `~/.insightface/models` saat pertama dipakai.

Saat pertama dijalankan, model diunduh otomatis dari Hugging Face:
`stabilityai/sd-vae-ft-mse` (~330 MB) untuk perlindungan, dan
`stable-diffusion-v1-5/stable-diffusion-v1-5` (~4 GB) untuk uji img2img.

## Menjalankan

### 1. Lindungi foto (tanpa pengaturan apa pun)

```bash
python scripts/protect_photo.py examples/fotoku.jpg
```

Hasilnya:
- `examples/fotoku_protected.png`: foto terlindungi. Upload file **ini**.
  Selalu disimpan sebagai PNG, karena menyimpan JPEG langsung akan melemahkan
  perlindungan sebelum foto sempat diupload.
- `examples/fotoku_protected.json`: manifest bukti. Simpan bersama foto asli
  di tempat aman, **jangan** upload foto aslinya.

Opsi yang berguna:

| Opsi | Fungsi |
|---|---|
| `--preset fast / balanced / strong` | 60 / 200 / 500 iterasi. `strong` memakai eps 12/255 (lebih kuat, sedikit lebih terlihat) |
| `--face-only` | hanya area wajah yang diubah (latar tetap 100% asli) |
| `--owner namaku` | ID pemilik di watermark (default: nama user OS) |
| `--vae A --vae B` | lindungi terhadap beberapa VAE sekaligus (ensemble), mis. tambah `madebyollin/sdxl-vae-fp16-fix` untuk SDXL |
| `--target noise` | arahkan ke pola acak berwarna (hasil edit jadi "gambar random"), bukan abu-abu |
| `--eps 4` | perubahan lebih halus (lebih tak terlihat, perlindungan lebih lemah) |
| `--no-eot` | matikan simulasi kompresi (sedikit lebih kuat tanpa kompresi, jauh lebih lemah setelah kompresi) |
| `--no-adaptive` | batas perubahan sama rata di semua piksel (lebih kuat, lebih terlihat) |

Beberapa file sekaligus: `python scripts/protect_photo.py a.jpg b.jpg c.jpg`

### 2. Uji apakah perlindungannya bekerja

Uji cepat, hanya encoder/decoder VAE (tanpa diffusion):

```bash
python scripts/evaluate_photo.py examples/fotoku.jpg examples/fotoku_protected.png --vae-only
```

Uji lengkap: Stable Diffusion img2img dengan prompt dan seed yang sama pada foto
asli vs terlindungi, diulang untuk beberapa simulasi kompresi:

```bash
python scripts/evaluate_photo.py examples/fotoku.jpg examples/fotoku_protected.png \
    --prompt "news photo of a man caught stealing a chicken at a night market"
```

Uji **transfer**, terhadap model yang tidak dipakai saat melindungi. Ini uji yang
paling jujur:

```bash
python scripts/evaluate_photo.py examples/fotoku.jpg examples/fotoku_protected.png \
    --model stabilityai/sdxl-turbo --work-size 512 --inference-steps 4 --guidance 0
```

Output di `eval_output/`: `grid_<kondisi>.png` (asli | terlindungi | selisih×10 |
rekonstruksi VAE | hasil edit AI) dan `report.json`. Tabel ringkasan dicetak ke
terminal.

**Cara membaca hasil:**

| Metrik | Artinya | Target |
|---|---|---|
| PSNR asli vs terlindungi | seberapa mirip (dB) | ≥ 35 dB (sulit dibedakan); `--face-only` biasanya > 40 dB |
| SSIM asli vs terlindungi | kemiripan struktur | ≥ 0.93 |
| `latent_shift` | seberapa jauh latent bergeser dari latent asli | makin besar makin baik (≥ 0.5 bagus) |
| `recon_psnr_protected_db` | kualitas rekonstruksi VAE foto terlindungi | jauh lebih rendah dari `recon_psnr_original_db` |
| `ssim_edit_original_vs_edit_protected` | kemiripan hasil edit AI dari foto asli vs dari foto terlindungi | makin rendah makin baik (< ~0.5) |

Lihat juga `grid_*.png` dengan mata: apakah wajahmu masih jelas di "edit AI dari
terlindungi"? Metrik otomatis tidak bisa menggantikan pengecekan visual.

### 3. Cek watermark

```bash
python scripts/verify_watermark.py examples/fotoku_protected.png --owner namaku \
    --manifest examples/fotoku_protected.json
```

### 4. Unit test

```bash
pytest -q
```

Unit test memakai VAE kecil berbobot acak, jadi berjalan di CPU tanpa unduhan
model. Test ini menguji **logika** (batas perubahan piksel, mask wajah, loss
turun, watermark, manifest), **bukan** efektivitas terhadap model asli. Untuk
efektivitas, pakai `evaluate_photo.py`.

## Status verifikasi prototipe ini

Bagian ini menjelaskan apa yang sudah dan belum diuji, supaya jelas.

**Sudah diuji** (CPU, tanpa GPU):
- 19 unit test lulus (termasuk video): batas perubahan piksel, mask wajah (piksel di luar wajah
  100% tidak berubah), loss turun, JPEG straight-through, watermark, manifest,
  dan alur lengkap.
- Semua script CLI dijalankan end-to-end memakai VAE kecil berbobot acak.
- Imperceptibility di foto sampel (astronot, scikit-image): PSNR ~36 dB /
  SSIM ~0,94 (seluruh foto), ~43,8 dB / 0,99 (`--face-only`).
- Watermark: terbaca 100% setelah JPEG kualitas 95–70, tidak terbaca di JPEG 50.

**Belum diuji:** efektivitas terhadap Stable Diffusion asli, karena lingkungan
pengembangan ini tidak punya GPU dan tidak bisa mengunduh model dari Hugging
Face. Itu langkah pertama yang perlu kamu jalankan di mesin ber-GPU:

```bash
python scripts/protect_photo.py examples/fotoku.jpg
python scripts/evaluate_photo.py examples/fotoku.jpg examples/fotoku_protected.png
```

Kalau hasilnya lemah, coba `--preset strong`, `--no-adaptive`, atau eps yang
lebih besar, lalu cari keseimbangan antara "tak terlihat" dan "kuat".

## Perkiraan waktu (preset `balanced`, foto 512 px)

| Perangkat | Perkiraan |
|---|---|
| GPU RTX 3060/4060 | ~20–40 detik |
| GPU A100 / RTX 4090 | ~8–15 detik |
| Apple M1/M2 (MPS) | ~2–5 menit |
| CPU | ~10–30 menit |

Angka di atas adalah perkiraan kasar dan belum diukur langsung. Waktu naik kira-kira
linear dengan `--steps` dan jumlah `--vae`.

## Tahap 2: Video

### Cara kerja

```
video ──► 1. DETEKSI    RetinaFace per frame + tracking (kotak dihaluskan, tahan saat
                        deteksi gagal sesaat) + deteksi pergantian adegan
      ──► 2. KEYFRAME   tiap N frame per wajah (default 10), crop wajah persegi
      ──► 3. OPTIMASI   PGD batch di GPU pada crop keyframe:
                          • loss VAE (PhotoGuard, Tahap 1) + loss identitas ArcFace
                          • EOT video: resize 0,4–1×, blur, noise, JPEG, warna 4:2:0,
                            dan H.264 SUNGGUHAN via FFmpeg (gradien straight-through)
                          • perturbasi = pola BERSAMA per wajah + residual kecil per keyframe
      ──► 4. TULIS      tiap frame: perturbasi diinterpolasi antar 2 keyframe terdekat,
                        ditempel mengikuti posisi wajah, dibatasi eps adaptif,
                        encode H.264 CRF 14 + audio asli (tanpa re-encode bila bisa)
```

- **Efisien.** Hanya keyframe yang dioptimasi (≈10% frame), di potongan wajah
  saja (≤512 px), dalam batch di GPU. Frame lain cukup diinterpolasi.
- **Tidak berkedip.** Perturbasi menempel pada wajah (ikut bergerak bersama
  wajah). Sebagian besar polanya sama untuk semua keyframe satu wajah, dan
  berubah halus antar-frame.
- **Format sama.** Resolusi, fps, jumlah frame, durasi, dan audio sama dengan
  aslinya (dicek otomatis dan dicatat di manifest). Frame tanpa wajah tidak
  diubah, hanya di-encode ulang dengan kualitas sangat tinggi.
- **Memori kecil.** Frame dibaca lewat pipe FFmpeg dalam beberapa lintasan, tidak
  disimpan ke disk atau RAM, sehingga video panjang tetap aman.

### Melindungi video

```bash
python scripts/protect_video.py examples/videoku.mp4
```

Hasil: `videoku_protected.mp4` + `videoku_protected.json` (manifest: hash, jumlah
wajah/track, keyframe, waktu tiap tahap, peringatan). Progress bar ditampilkan
untuk keempat tahap.

| Opsi | Fungsi |
|---|---|
| `--preset fast / balanced / strong` | keyframe tiap 15 / 10 / 5 frame; 40 / 80 / 200 iterasi; `strong` eps 10/255 |
| `--key-interval N` | jarak keyframe manual (kecil = lebih kuat, lebih lambat) |
| `--batch-size 4` | keyframe per batch GPU; turunkan jika VRAM habis |
| `--identity auto/on/off` | serangan identitas ArcFace (anti face-swap) |
| `--no-h264-eot` | tanpa simulasi H.264 saat optimasi (lebih cepat, kurang tahan kompresi) |
| `--no-temporal` | tiap keyframe independen (hanya untuk perbandingan, bisa berkedip) |
| `--vae A --vae B` | ensemble VAE, mis. tambah `madebyollin/sdxl-vae-fp16-fix`, atau versi ringan `taesd:/path/taesdxl_encoder.pth` |
| `--keep-audio` | simpan juga audio asli terpisah (`*_audio.mka`), untuk Tahap 3 nanti |
| `--watermark` | watermark tak terlihat di tiap frame (lihat catatan di bawah) |
| `--crf 14` | kualitas output H.264 |

### Menguji video

```bash
# cepat: kualitas visual + uji VAE + identitas ArcFace, mentah vs setelah kompresi ala TikTok
python scripts/test_video.py videoku.mp4 videoku_protected.mp4

# + Stable Diffusion img2img per frame (butuh GPU)
python scripts/test_video.py videoku.mp4 videoku_protected.mp4 --attacks vae,identity,img2img

# + face swap InsightFace inswapper (unduh inswapper_128.onnx sendiri; lisensi non-komersial)
python scripts/test_video.py videoku.mp4 videoku_protected.mp4 --attacks vae,identity,swap \
    --swap-model models/inswapper_128.onnx --swap-target examples/orang_lain.jpg

# uji transfer ke model lain: ulangi --vae
python scripts/test_video.py videoku.mp4 videoku_protected.mp4 \
    --vae stabilityai/sd-vae-ft-mse --vae madebyollin/sdxl-vae-fp16-fix
```

`--profile tiktok` (default: H.264 ≤1080p, 2 Mbps), `tiktok_low` (≤720p,
800 kbps, kasus buruk), atau `whatsapp`. TikTok tidak mempublikasikan pengaturan
pastinya, jadi ini perkiraan.

Output di `video_eval/`:
- `side_by_side_raw.mp4` dan `side_by_side_tiktok.mp4`: asli | terlindungi | selisih×10
- `comparison_<kondisi>.png/.mp4`: per frame sampel, asli | terlindungi | selisih |
  rekonstruksi VAE | hasil img2img / swap dari asli vs dari terlindungi
- `report.json`: semua angka

| Metrik di `report.json` | Artinya | Bagus jika |
|---|---|---|
| `visual_quality.psnr_mean_db` / `ssim_mean` | asli vs terlindungi, per frame | ≥ 35 dB / ≥ 0,95; bandingkan dengan `visual_quality_baseline_reencode_only` |
| `flicker_mean_abs_0_255` | rata-rata perubahan antar-frame dari residual (terlindungi − asli) | mendekati baseline encode ulang |
| `id_direct_protected_mean` | cosine ArcFace wajah terlindungi vs asli = yang "dilihat" inswapper | < ~0,3 (orang lain) |
| `vae.<model>.target_distance_rel` | jarak latent ke target abu-abu, relatif | < 1 (makin kecil makin tertipu) |
| `img2img_id_from_*` / `swap_id_from_*` | identitas wajah di hasil fake vs wajahmu | `from_protected` jauh di bawah `from_original` |
| `protection_remaining_after_compression` | efek setelah kompresi ÷ efek sebelum | 1,0 = utuh, 0 = hilang |

### Kebutuhan GPU & perkiraan waktu

| | Minimum | Disarankan |
|---|---|---|
| Perlindungan (VAE SD + ArcFace, batch 4, crop ≤512) | NVIDIA 8 GB VRAM | 12–24 GB |
| Uji img2img (SD 1.5 fp16) | +4 GB | |
| CPU / Apple MPS | bisa, tapi sangat lambat (lihat di bawah) | |

Waktu didominasi tahap optimasi: **(jumlah keyframe ÷ batch) × iterasi**. Untuk
video 30 fps dengan satu wajah, preset `balanced` berarti 180 keyframe/menit,
yaitu 45 batch × 80 iterasi = 3.600 iterasi batch per menit video.

| Perangkat | Perkiraan per **menit** video (1 wajah, `balanced`) |
|---|---|
| RTX 4090 / A100 | ~8–15 menit |
| RTX 3060 / T4 | ~25–45 menit |
| CPU 4 core | berjam-jam (tidak disarankan) |

Angka GPU di atas adalah **perkiraan, belum diukur**: lingkungan pengembangan
prototipe ini tidak punya GPU. Pada CPU 4 core, dengan encoder ringan TAESD,
yang terukur: video 4 detik (120 frame, 1 wajah, 13 keyframe, 40 iterasi) butuh ±12–13 menit, dan hampir semuanya di tahap optimasi. `fast` kira-kira 3× lebih cepat dari
`balanced`. Deteksi dan penulisan video menambah ±1–2 menit per menit video.
Simulasi H.264 di EOT memanggil FFmpeg (CPU), jadi CPU yang lambat ikut
memperlambat proses walau ada GPU.

### Hasil pengujian (jujur)

**Kondisi uji.** Lingkungan pengembangan hanya punya CPU, tanpa GPU, dan tidak
bisa mengunduh dari Hugging Face. Karena itu:
- **Video uji** adalah klip sintetis 4 detik, portrait 540×960, 30 fps, dengan
  audio: foto wajah (sampel "astronaut" dari scikit-image) yang di-pan dan di-zoom.
  Belum video HP sungguhan dengan ekspresi, gerak kepala, atau cahaya berubah.
- **Model yang diserang**: TAESD (encoder ringan untuk ruang latent SD 1.x), bukan
  VAE SD asli. Transfer diuji ke TAESD-SDXL dan TAESD-Flux.
- **Identitas**: ArcFace `w600k_r50` asli (InsightFace buffalo_l). Ini model yang
  dipakai inswapper untuk mengambil wajah sumber. **inswapper sendiri dan SD img2img
  belum dijalankan** (modelnya tidak bisa diunduh di sini); kodenya ada di
  `test_video.py` dan perlu dijalankan di mesin ber-GPU.
- Anggaran: 40 iterasi/batch, keyframe tiap 10 frame, eps 8/255 adaptif.

**1. Kualitas visual & flicker** (asli vs terlindungi, rata-rata 120 frame)

| | PSNR | SSIM | perubahan antar-frame (0–255) |
|---|---|---|---|
| hanya encode ulang (baseline) | 42,9 dB | 0,987 | 1,32 |
| **terlindungi (default)** | **40,6 dB** | **0,981** | **1,53** |
| setelah kompresi TikTok | 39,4 dB | 0,972 | – |

Penurunan dari baseline kecil. Di video side-by-side tidak terlihat kedip, tetapi
noise halus di kulit bisa terlihat jika di-zoom dan dibandingkan langsung.

**2. Anti face-swap: kemiripan ArcFace wajah terlindungi vs asli, per frame**
(< ~0,3–0,4 umumnya dianggap orang lain; tanpa perlindungan ≈ 0,95–1,0)

| Varian | mentah | TikTok 2 Mbps | TikTok-low 800 kbps | frame > 0,4 |
|---|---|---|---|---|
| hanya VAE (Tahap 1, tanpa serangan identitas) | ~0,95 | – | – | semua |
| pola bersama per wajah (`--shared-pattern`) | 0,66 | 0,67 | – | sebagian besar |
| keyframe independen, tempel per kotak wajah | 0,33 | 0,36 | 0,40 | 43–56 / 120 |
| **default: + propagasi landmark + jitter alignment** | **0,18** | **0,19** | **0,21** | **0 / 120** (maks 0,39) |

Perjalanan menuju default ini juga temuan penting:
- Perturbasi identitas sangat peka terhadap pergeseran beberapa piksel. Saat masih
  ditempel mengikuti kotak wajah (yang dihaluskan dan sedikit tertinggal dari
  gerakan), keyframe terlindungi (0,06) tetapi frame di antaranya bocor sampai 0,78.
  Menempel mengikuti 5 landmark wajah di tiap frame memperbaikinya.
- "Pola bersama" dirancang untuk mencegah flicker, tetapi ternyata tidak
  mengurangi flicker (interpolasi sudah menghaluskan) dan justru melemahkan
  perlindungan. Jadi dimatikan secara default.
- Efek bertahan setelah kompresi: ~97–100% tersisa pada TikTok 2 Mbps, dan
  tetap di bawah 0,4 pada 800 kbps.

**3. Anti editing Stable Diffusion (VAE): lemah di video.**
Jarak latent ke target tetap ≈ 0,99–1,00 (1 = tidak berefek), baik di TAESD yang
diserang langsung maupun di SDXL/Flux. Uji per-crop menunjukkan penyebabnya:
pada eps 8/255, serangan VAE saja turun ke 0,65 tanpa EOT dan hasil rekonstruksi
VAE jelas rusak. Namun dengan EOT video (resize 0,4×, H.264, 4:2:0) hanya
0,90, dan bila digabung dengan serangan identitas ≈ 0,96.

Efek samping yang menarik: identitas wajah di hasil encode→decode VAE ikut turun
(SD 0,71 → 0,48; SDXL 0,71 → 0,50; Flux 0,97 → 0,31), karena perturbasi identitas
ikut "lolos" melewati VAE. Apakah ini bertahan pada img2img penuh (yang menambah
noise lalu membersihkannya) **belum teruji**.

**Kapan perlindungan gagal / belum terlindungi**
- Frame yang wajahnya tidak terdeteksi (wajah sangat menyamping, tertutup, sangat
  kecil, blur gerak berat) tidak dilindungi sama sekali.
- Face swap / pengenal wajah yang tidak memakai ArcFace `w600k_r50` (SimSwap,
  DeepFaceLab, model komersial): belum diuji, kemungkinan jauh lebih lemah.
- Penyerang yang "mencuci" video lebih dulu (denoise, upscale AI, resize besar).
- Editing berbasis Stable Diffusion/Flux: perlindungan VAE praktis tidak efektif
  setelah kompresi video pada eps 8/255.
- Watermark per frame (`--watermark`): terbaca setelah TikTok 2 Mbps pada
  resolusi yang sama, **hilang** pada 800 kbps atau jika video di-resize.

**Yang perlu diperbaiki**
1. Uji di GPU dengan model asli: VAE SD, img2img, inswapper, dan video HP sungguhan
   (beberapa orang, gerak kepala, cahaya rendah).
2. Ensemble pengenal wajah (ArcFace + AdaFace/FaceNet/CurricularFace) agar
   perlindungan identitas menular ke model lain, bukan hanya white-box.
3. Serangan VAE yang lebih tahan video: anggaran lebih besar khusus area wajah,
   target selain abu-abu, atau serangan ke UNet/denoiser (pendekatan Mist / SDS).
4. Kecepatan: simulasi H.264 memanggil FFmpeg per langkah (CPU), sehingga perlu
   diganti dengan aproksimasi diferensiabel di GPU.
5. Watermark video yang tahan resize: voting lintas frame, atau pola yang
   tidak bergantung pada grid 8×8.


## Pembaruan: ensemble, EOT kuat, batas SSIM, watermark lapis 2

Pembaruan ini menindaklanjuti hasil uji nyata pengguna:
- face swap pada foto terlindungi **rusak** (berhasil);
- AI image generator komersial (Gemini/ChatGPT) **masih bisa mengedit** (gagal);
- foto besar dari HP terlihat **bertekstur/rusak**.

### Yang berubah
| | Sebelum | Sekarang |
|---|---|---|
| Encoder yang diserang | VAE SD 1.5 (+ ArcFace) | **ensemble**: VAE SD 1.5 + SDXL, **CLIP ViT-L/14**, **SigLIP B/16**, ArcFace (`--ensemble`, default aplikasi di GPU). Bisa ditambah, mis. VAE FLUX (`--vae black-forest-labs/FLUX.1-schnell`) atau SigLIP So400m (`--embedder openclip:hf-hub:timm/ViT-SO400M-14-SigLIP-384`) |
| EOT foto | resize 0,75–1×, JPEG 50–95 | **resize 512–1024 px, JPEG 60–90, crop acak ≤5%, warna ±5%**, blur, noise |
| Foto besar | dioptimasi lewat resize di resolusi penuh → **pola kotak/tekstur** (bug) | dioptimasi di ≤1024 px, perturbasi **diperbesar halus** (bikubik) |
| Tak terlihat | eps adaptif saja | + **pengaman SSIM**: kekuatan diturunkan otomatis sampai SSIM ≥ 0,95 (termasuk watermark) |
| Watermark | DCT-QIM | DCT-QIM + **lapis 2: RivaGAN** (default aplikasi) atau **TrustMark** (`--watermark2`) |

LPIPS tidak dipakai sebagai batasan karena bobotnya tidak bisa diunduh di lingkungan
pengembangan. Sebagai gantinya dipakai SSIM, yang terukur dan dijamin ≥ 0,95.

### Cara pakai
```bash
python scripts/protect_photo.py fotoku.jpg --ensemble --watermark2 rivagan     # GPU disarankan
python scripts/eval_transfer.py fotoku.jpg --name uji --train-vae ... --eval-vae ...   # uji held-out
python scripts/eval_watermark.py fotoku.jpg --vae taesd:/path/taef1_encoder.pth      # uji watermark
```

### Hasil 3 eksperimen (jujur)

**Kondisi.** Hanya CPU, tanpa akses Hugging Face. Karena itu VAE yang dipakai adalah
versi ringan TAESD (SD 1.5, SDXL, SD3, Flux); CLIP ViT-L/14 tidak bisa diunduh, jadi
encoder multimodal yang dipakai adalah **SigLIP asli Google** (B/16). Gambar uji: 2 foto
(astronaut 512 px dan versi 3000 px seukuran foto HP), 100 iterasi. Sampelnya kecil, jadi
anggap angka ini indikasi, bukan bukti.

Cara membaca:
- Angka = rata-rata similarity foto terlindungi vs asli. Untuk VAE, angkanya jarak ke
  target (1 = tidak berefek). Untuk CLIP/SigLIP dan wajah, angkanya cosine (1 = sama
  persis; makin rendah makin terganggu).
- Dalam kurung = kontrol noise acak dengan besar per-piksel yang sama.
- "upload" = maks 1024 px + JPEG 75. "berat" = maks 512 px + JPEG 60.

**Eksperimen 1: baseline** (VAE SD 1.5 + ArcFace, EOT lama)

| encoder | status | mentah | upload | berat |
|---|---|---|---|---|
| VAE SD 1.5 (taesd) | dilatih | **0,855** (1,03) | **0,886** (1,01) | **0,91** (1,01) |
| VAE SDXL / SD3 / Flux | held-out | 0,99–1,02 (~1,0) | ~1,0 | ~1,0 |
| SigLIP B/16 | held-out | 0,995 (0,999) | 0,996 | 0,997 |
| SigLIP i18n B/16-256 | held-out | 0,989 (0,999) | 0,989 | 0,99 |
| Wajah ArcFace w600k (dipakai inswapper) | dilatih | **0,08** (0,99) | **0,16** (0,99) | **0,33** (0,98) |
| Wajah glintr100 (antelopev2) | **held-out** | **0,39** (0,99) | **0,43** (0,99) | **0,49** (0,98) |

**Eksperimen 2: ensemble + EOT kuat** (VAE SD 1.5 + SDXL, SigLIP B/16, ArcFace)

| encoder | status | mentah | upload | berat |
|---|---|---|---|---|
| VAE SD 1.5 / SDXL | dilatih | 0,98 / 1,01 | 0,99 / 1,01 | 0,99 / 1,01 |
| VAE SD3 / Flux | held-out | 1,02 / 1,00 | 1,01 / 1,00 | 1,01 / 1,00 |
| SigLIP B/16 | dilatih | **0,20** (0,999) | **0,33** (0,999) | **0,57** (0,999) |
| SigLIP i18n B/16-256 | **held-out** | **0,971** (0,999) | 0,975 | 0,973 |
| Wajah ArcFace w600k | dilatih | **0,05** (0,99) | **0,13** (0,99) | **0,36** (0,98) |
| Wajah glintr100 | **held-out** | **0,35** (0,99) | **0,39** (0,99) | **0,48** (0,98) |

Kualitas (kedua eksperimen): SSIM 0,951–0,963, PSNR 35–38 dB, dan target SSIM ≥ 0,95
terpenuhi. Pada foto 3000 px, pola kotak dari versi lama hilang, tapi di-zoom masih
terlihat belang halus di kulit.

**Eksperimen 3: ketahanan watermark** (% bit benar; 50% = tebakan acak, ≥ 90% = pemilik terbukti; 3 gambar)

| watermark | PSNR / SSIM | tanpa serangan | JPEG 75 | resize 50% | crop 10% | warna +8% | regenerasi VAE SD | regenerasi VAE Flux |
|---|---|---|---|---|---|---|---|---|
| DCT-QIM (lapis 1) | 50,3 dB / 0,995 | 100% | 100% | 88% | 55% | 100% | 62% | 85% |
| **RivaGAN** (lapis 2) | 40,8 dB / 0,963 | 100% | 100% | **100%** | **100%** | 100% | 79% | 88% |
| TrustMark | – | tidak bisa diuji di sini (model diunduh dari server Adobe yang diblokir); didukung di kode |

**Kesimpulan**
1. **Anti face-swap kuat dan menular.** Serangan ArcFace juga menurunkan similarity di
   pengenal wajah lain yang tidak dilatih (glintr100: 0,35–0,48 vs 0,98 untuk noise),
   tetap bertahan setelah kompresi. Ini sesuai dengan laporan uji nyata pengguna (face swap rusak).
2. **Ensemble hanya kuat pada encoder yang ikut dilatih.** SigLIP yang dilatih turun ke
   0,20, tetapi SigLIP lain (held-out) hanya ke 0,97. Untuk VAE pun hampir tidak ada
   transfer: efek di SD3/Flux ≈ noise. Model komersial seperti Gemini/ChatGPT memakai
   encoder tertutup (setara "held-out"), jadi **perlindungan ini kemungkinan besar tetap
   tidak menghentikan mereka**, dengan atau tanpa ensemble. Ini sejalan dengan riset
   (mis. Hönig dkk. 2024).
3. **Dalam ensemble, efek VAE melemah** (0,855 → 0,98), karena anggaran perturbasi yang
   sama (dibatasi SSIM ≥ 0,95) dibagi ke lebih banyak target. Tidak ada yang gratis:
   menyerang lebih banyak model berarti tiap model kebagian lebih sedikit.
4. **Watermark tidak membuktikan kepemilikan setelah foto "digambar ulang" AI.** RivaGAN
   tahan resize, crop, JPEG, dan warna, tetapi setelah regenerasi VAE hanya 79–88% (di
   bawah ambang 90%). Foto hasil edit Gemini/ChatGPT kemungkinan besar kehilangan
   watermark. Bukti terkuatmu tetap **file asli + manifest (hash & waktu)**, dan ke depan
   C2PA. RivaGAN juga menurunkan SSIM (0,963), sehingga pengaman SSIM mengurangi
   kekuatan perlindungan bila keduanya dipakai.

**Rekomendasi pemakaian:** pakai aplikasi ini terutama untuk **anti face-swap/deepfake
wajah**, yang terbukti bekerja. Jangan mengandalkannya untuk mencegah editing oleh AI
komersial. Untuk itu, langkah yang lebih efektif adalah membatasi resolusi dan jumlah
foto wajah yang diunggah publik, menyimpan bukti asli, dan melaporkan penyalahgunaan.

## Keterbatasan (baca ini)

Bagian ini sengaja ditulis lugas. Perlindungan adversarial adalah bidang riset
yang aktif, dan banyak klaim "anti-AI" di internet berlebihan.

**1. Hanya ampuh terhadap model yang diserang (atau yang mirip).**
Perturbasi dioptimasi untuk encoder VAE Stable Diffusion 1.x/2.x (VAE yang sama).
Terhadap model dengan VAE berbeda (SDXL, SD3, Flux, Midjourney, model tertutup
seperti DALL·E / Gemini) efeknya **jauh lebih lemah atau hilang**. Ensemble
(`--vae` berulang) membantu sebagian, tapi tidak ada jaminan untuk model yang
belum ada. Uji transfer di atas ada untuk mengukur ini.

**2. Perlindungan VAE saja TIDAK menghentikan face-swap; serangan identitas hanya white-box ke satu model.**
Uji di Tahap 2 menunjukkan perlindungan VAE (PhotoGuard) membuat hasil edit
Stable Diffusion rusak, tetapi similarity ArcFace wajah terlindungi vs asli tetap
~0,95. Artinya inswapper/Roop/FaceFusion tetap bisa mengambil wajahmu. Karena itu
sekarang ada serangan identitas (`identity_attack.py`) yang menurunkannya ke
~0,0 di foto dan ~0,2 di video setelah kompresi TikTok (lihat hasil uji Tahap 2). Namun serangan itu white-box terhadap ArcFace `w600k_r50`.
Model ini dipakai inswapper dan banyak turunannya, tetapi tidak dipakai oleh
SimSwap, DeepFaceLab (yang dilatih dari ratusan foto/video target), atau model
komersial. Terhadap model-model itu efeknya belum teruji dan kemungkinan jauh
lebih lemah.

**3. Kompresi, resize, dan "pembersihan" melemahkan perlindungan.**
EOT membuat perlindungan lebih tahan JPEG dan resize ringan, tapi:
- JPEG kualitas rendah (< 50), resize besar, crop, rotasi, atau screenshot
  menurunkan efeknya, terkadang drastis.
- Penyerang yang tahu bisa "mencuci" foto lebih dulu: blur + upscale, JPEG
  berulang, denoising diffusion (DiffPure), atau upscaler AI. Riset
  (mis. Radiya-Dixit dkk. 2022, *"Data Poisoning Won't Save You From Facial
  Recognition"*; Hönig dkk. 2024, *"Adversarial Perturbations Cannot Reliably
  Protect Artists From Generative AI"*) menunjukkan perlindungan semacam ini bisa
  dipatahkan dengan cara-cara sederhana tersebut.
- Model masa depan bisa dilatih supaya kebal terhadap perturbasi lama, dan foto
  yang sudah terupload tidak bisa "diperbarui" perlindungannya.

**4. Trade-off tak terlihat vs kuat.**
"Terlihat sama persis" tidak benar-benar 100%. Di PSNR ~36 dB, perbedaannya
hampir tidak terlihat saat dilihat biasa, tapi jika dibandingkan berdampingan
dan di-zoom, noise halus bisa terlihat di area datar, terutama di layar terang
atau HDR. eps adaptif mengurangi ini. `--face-only` atau `--eps 4` lebih halus
lagi, dengan harga perlindungan yang lebih lemah. Makin kuat perlindungan,
makin terlihat perubahannya. Tidak ada pengaturan yang sekaligus 100% tak
terlihat dan 100% kuat.

**5. Watermark bukan bukti hukum yang kuat.**
Watermark DCT tahan JPEG sampai kualitas ~70, tapi hilang karena crop, resize,
rotasi, atau sengaja dihapus, dan siapa pun bisa membuat watermark serupa.
Manifest JSON hanya catatan milikmu sendiri (belum ditandatangani). Untuk bukti
yang bisa diverifikasi pihak lain perlu C2PA / Content Credentials dengan
sertifikat penandatangan. Platform seperti TikTok biasanya membuang metadata saat
upload, jadi C2PA pun perlu disimpan terpisah.

**6. Tidak bisa membuat hasil deepfake "otomatis berubah jadi video random".**
Perturbasi tidak "aktif" atau mendeteksi niat jahat. Ia hanya membuat model
tertentu salah membaca foto, kapan pun foto itu diproses, termasuk untuk editing
yang tidak berbahaya. Hasilnya tidak menjamin wajahmu hilang sepenuhnya. Kadang
hasilnya hanya blur atau berubah warna, sementara wajah masih bisa dikenali.

**7. Deteksi wajah.**
Untuk foto, `--face-only` memakai Haar cascade bawaan OpenCV, yang sering
melewatkan wajah miring atau dari samping (mode default melindungi seluruh foto).
Video memakai RetinaFace (InsightFace) jika terpasang. Frame yang wajahnya tidak
terdeteksi sama sekali **tidak terlindungi**.

**Kesimpulan:** gunakan sebagai satu lapisan perlindungan, bersama kebiasaan lain:
upload resolusi secukupnya, simpan file asli + manifest sebagai bukti, dan
laporkan deepfake ke platform / pihak berwajib (di Indonesia: UU ITE & UU PDP).

## Roadmap

- **Selesai**: Tahap 1 (foto), Tahap 2 (video), serangan identitas ArcFace.
- **Perbaikan berikutnya** (lihat "Yang perlu diperbaiki" di Tahap 2):
  - Ensemble identitas (ArcFace + AdaFace/FaceNet) agar tidak hanya white-box
    ke satu model, dan serangan ke detektor wajah.
  - Ensemble VAE default (SD1.5 + SDXL + Flux), mis. via TAESD agar murah.
  - Anti-DreamBooth: mengganggu fine-tuning model dari kumpulan foto/video.
  - Uji dengan model asli di GPU (VAE SD, img2img, inswapper) dan video sungguhan.
- **Tahap 3**, suara: perturbasi anti voice-cloning (pendekatan AntiFake)
  terhadap speaker encoder.
- **Tahap 4**, aplikasi: FastAPI + antrean job GPU (`antideepfake.pipeline`
  sudah berupa fungsi yang siap dipanggil dari endpoint), web upload → proses →
  download, lalu mobile.

## Referensi

- Salman et al., *Raising the Cost of Malicious AI-Powered Image Editing* (PhotoGuard), ICML 2023.
- Shan et al., *Fawkes: Protecting Privacy against Unauthorized Deep Learning Models*, USENIX Security 2020.
- Van Le et al., *Anti-DreamBooth: Protecting users from personalized text-to-image synthesis*, ICCV 2023.
- Yu et al., *AntiFake: Using Adversarial Audio to Prevent Unauthorized Speech Synthesis*, ACM CCS 2023.
- Athalye et al., *Synthesizing Robust Adversarial Examples* (EOT), ICML 2018.
- Hönig et al., *Adversarial Perturbations Cannot Reliably Protect Artists From Generative AI*, 2024.
- C2PA / Content Credentials: https://c2pa.org
