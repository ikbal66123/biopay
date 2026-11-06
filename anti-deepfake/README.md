# Anti-Deepfake: Tahap 1, Perlindungan Foto

Prototipe untuk melindungi foto pribadi sebelum diupload ke media sosial, supaya
lebih sulit dipakai AI untuk membuat editan palsu (misalnya wajahmu ditempel ke
foto "maling ayam").

Cara kerjanya: kamu memasukkan satu foto dan mendapat satu foto baru yang
terlihat sama, tapi isinya sudah:

1. **Diberi "racun" tak terlihat** (*adversarial perturbation*): perubahan
   piksel yang sangat kecil (maksimal ±8 dari 255, lebih kecil lagi di area
   datar seperti kulit dan langit) yang membuat encoder
   Stable Diffusion salah membaca foto, seolah-olah foto itu cuma bidang abu-abu
   atau pola acak. Editor AI berbasis Stable Diffusion lalu menghasilkan gambar
   yang rusak atau tidak mirip kamu.
2. **Diberi watermark tak terlihat** berisi tag pemilik (hash dari ID kamu).
3. **Dicatat dalam manifest JSON**: hash SHA-256 file asli & terlindungi, waktu,
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
│   ├── photoguard.py        # inti: serangan encoder PGD + EOT, preset, multi-VAE
│   ├── augment.py           # transformasi EOT: resize, JPEG (straight-through), blur, noise
│   ├── pipeline.py          # alur "satu klik": foto → terlindungi + watermark + manifest
│   ├── watermark.py         # watermark tak terlihat (QIM pada DCT 8x8) berisi tag pemilik
│   ├── manifest.py          # manifest JSON (hash SHA-256, waktu, pengaturan)
│   ├── faces.py             # deteksi wajah (OpenCV) + mask wajah
│   ├── metrics.py           # PSNR, SSIM, LPIPS (opsional)
│   ├── imageio.py           # baca/tulis gambar, JPEG, resize
│   └── device.py            # pilih CUDA / MPS / CPU
├── scripts/
│   ├── protect_photo.py     # lindungi foto
│   ├── evaluate_photo.py    # uji: edit AI pada foto asli vs terlindungi, + kompresi
│   └── verify_watermark.py  # cek watermark & cocokkan dengan manifest
├── tests/                   # unit test (memakai VAE kecil acak, tanpa unduhan)
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
```

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
- 10 unit test lulus: batas perubahan piksel, mask wajah (piksel di luar wajah
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

## Keterbatasan (baca ini)

Bagian ini sengaja ditulis lugas. Perlindungan adversarial adalah bidang riset
yang aktif, dan banyak klaim "anti-AI" di internet berlebihan.

**1. Hanya ampuh terhadap model yang diserang (atau yang mirip).**
Perturbasi dioptimasi untuk encoder VAE Stable Diffusion 1.x/2.x (VAE yang sama).
Terhadap model dengan VAE berbeda (SDXL, SD3, Flux, Midjourney, model tertutup
seperti DALL·E / Gemini) efeknya **jauh lebih lemah atau hilang**. Ensemble
(`--vae` berulang) membantu sebagian, tapi tidak ada jaminan untuk model yang
belum ada. Uji transfer di atas ada untuk mengukur ini.

**2. Tidak dirancang untuk face-swap klasik.**
Aplikasi face-swap seperti InsightFace/inswapper, SimSwap, DeepFaceLab, atau
Roop/FaceFusion tidak memakai VAE Stable Diffusion. Mereka memakai detektor wajah
dan *face embedding* (ArcFace). Untuk itu dibutuhkan serangan lain, terhadap
detektor wajah atau embedding identitas (pendekatan seperti Fawkes / LowKey).
Itu langkah berikutnya yang paling penting (lihat Roadmap).

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

**7. Deteksi wajah sederhana.**
`faces.py` memakai Haar cascade bawaan OpenCV, yang sering melewatkan wajah
miring atau dari samping. Ini hanya berpengaruh pada `--face-only` dan laporan
jumlah wajah. Mode default melindungi seluruh foto.

**Kesimpulan:** gunakan sebagai satu lapisan perlindungan, bersama kebiasaan lain:
upload resolusi secukupnya, simpan file asli + manifest sebagai bukti, dan
laporkan deepfake ke platform / pihak berwajib (di Indonesia: UU ITE & UU PDP).

## Roadmap

- **Tahap 1b**, masih untuk foto:
  - Serangan terhadap *face embedding* (ArcFace/FaceNet) dan detektor wajah,
    supaya juga melawan face-swap klasik (pendekatan Fawkes / LowKey).
  - Anti-DreamBooth: mengganggu fine-tuning model dari kumpulan foto.
  - Ensemble default SD1.5 + SDXL VAE.
  - Detektor wajah yang lebih baik (YuNet/RetinaFace).
- **Tahap 2**, video: FFmpeg → frame → deteksi & tracking wajah → perlindungan
  per frame, dengan perturbasi yang konsisten antar frame dan EOT kompresi H.264
  (bitrate rendah seperti TikTok) → gabung ulang dengan audio.
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
