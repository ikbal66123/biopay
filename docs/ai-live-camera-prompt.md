# AI Live Camera — Penjelasan Lengkap & Prompt

Dokumen ini memperluas ide aplikasi **AI Live Camera**: kamera siaran langsung yang bisa mengubah baju, benda, latar, dan warna tembok hanya dengan mengetik perintah, lalu hasilnya dipakai sebagai webcam di TikTok Live, Instagram Live, YouTube, Zoom, OBS, dan lainnya.

**Aplikasi versi awal (MVP):** [`ai-live-camera/index.html`](../ai-live-camera/index.html). Buka di Chrome, izinkan kamera, lalu ketik perintah.

---

## 1. Penjelasan ide yang diperluas

### Gambaran sederhana
Bayangkan filter atau efek di media sosial, tapi **kamu sendiri yang menentukan efeknya dengan kalimat biasa**. Kamu tidak perlu memilih dari daftar filter. Cukup ketik:

> "Ubah baju saya menjadi jaket kulit hitam."

Beberapa detik kemudian, di siaranmu kamu sudah memakai jaket kulit hitam, dan jaket itu ikut bergerak saat kamu bergerak, menoleh, atau mengangkat tangan.

### Apa bedanya dengan filter biasa?
| Filter biasa | AI Live Camera |
|---|---|
| Efek sudah dibuat dulu oleh desainer | Efek dibuat saat itu juga dari tulisanmu |
| Pilihan terbatas | Pilihan tidak terbatas, sesuai imajinasi |
| Biasanya hanya wajah | Baju, benda di tangan atau di meja, tembok, seluruh ruangan |
| Satu efek per waktu | Beberapa perubahan sekaligus dalam satu kalimat |

### Apa saja yang bisa diubah
1. **Pakaian.** AI mengenali bagian tubuh yang tertutup baju (atasan, bawahan, jaket, topi), lalu menggantinya dengan pakaian baru sesuai tulisan. Pakaian baru mengikuti pose dan gerakan tubuh.
2. **Benda.** AI mencari benda yang disebut ("cangkir di meja", "botol yang saya pegang"), lalu menggantinya dengan benda lain ("lampu petromaks yang menyala", "pedang cahaya"). Benda baru tetap berada di posisi benda lama, termasuk saat benda itu dipindah.
3. **Tembok dan warna ruangan.** AI memisahkan tembok dari orang dan perabot, lalu mengganti warna atau teksturnya (cat hijau sage, dinding bata merah tua, panel kayu).
4. **Latar belakang penuh.** Seluruh ruangan di belakang kamu bisa diganti jadi pemandangan lain (studio berita, pantai saat senja, kafe di Tokyo), dengan kamu tetap di depan.
5. **Perintah bertahap.** Perubahan bisa ditambah, dibatalkan ("kembalikan baju asli"), atau disimpan sebagai preset ("Gaya Podcast Malam").

### Bagaimana cara kerjanya (versi singkat)
1. **Kamera** menangkap gambar sekitar 30 kali per detik.
2. **Pemahaman perintah**: model bahasa (LLM) membaca kalimatmu dan memecahnya jadi daftar tugas yang rapi, misalnya `baju → jaket kulit hitam`, `tembok → bata merah tua`, `cangkir → petromaks menyala`.
3. **Pencarian bagian gambar**: model segmentasi menemukan mana tubuh, mana baju, mana tembok, mana cangkir, lalu membuat "topeng" (mask) untuk tiap bagian.
4. **Pelacakan**: topeng itu diikuti dari gambar ke gambar supaya tidak perlu dicari ulang setiap saat (ini kunci agar ringan).
5. **Pembuatan gambar baru**: model AI gambar cepat (LCM, SDXL-Turbo, atau StreamDiffusion) menggambar ulang hanya bagian yang ditopengi.
6. **Penggabungan**: hasilnya ditempel kembali ke video dengan tepi yang halus dan pencahayaan yang disesuaikan.
7. **Kamera virtual**: video akhir dikirim ke webcam virtual, jadi aplikasi siaran mana pun bisa memilihnya seperti webcam biasa.

### Kenapa bisa tetap ringan
Tidak semua hal perlu digambar ulang di setiap frame:
- **Tembok dan latar** cukup dibuat **sekali** saat perintah masuk, lalu tinggal ditempel di belakang orang. Biayanya hampir nol per frame.
- **Ganti warna tembok** cukup dengan mengubah warna di area topeng tembok, tanpa model gambar.
- **Benda** dibuat sekali sebagai gambar dengan latar transparan, lalu ditempel dan diputar mengikuti posisi benda asli.
- **Hanya baju** yang benar-benar perlu digambar ulang terus-menerus karena berubah bentuk mengikuti tubuh. Bagian ini memakai model tercepat pada resolusi kecil (sekitar 512 piksel) dengan panduan pose.
- Pekerjaan berat berjalan **terpisah** dari tampilan video. Kalau AI sedang lambat, video tetap jalan dan memakai hasil terakhir, jadi siaran tidak macet.

### Batasan yang perlu diketahui sejak awal
- Untuk hasil real-time di komputer sendiri dibutuhkan kartu grafis (GPU) NVIDIA, minimal kelas RTX 3060. Tanpa GPU, gunakan mode cloud (server GPU sewaan) dengan jeda tambahan sekitar 100–300 ms.
- Baju yang digambar ulang setiap frame bisa sedikit "berkedip". Ini dikurangi dengan teknik konsistensi antar-frame, tapi belum akan sempurna di versi pertama.
- Di HP, versi awal sebaiknya hanya latar dan warna tembok (bisa dijalankan langsung di HP). Ganti baju dan benda lewat server cloud.
- Aplikasi wajib memberi tanda bahwa video sudah diubah AI, dan tidak boleh dipakai untuk menyamar sebagai orang lain atau membuat konten tidak senonoh. Filter keamanan diterapkan pada setiap perintah.

---

## 2. Prompt utama untuk AI pembuat program

Salin seluruh blok di bawah ini ke Claude, ChatGPT, atau asisten pemrograman lain.

```text
Bertindaklah sebagai Senior Developer dan Arsitek Sistem yang ahli di computer vision,
AI generatif real-time, dan aplikasi siaran langsung.

Saya ingin membuat aplikasi "AI Live Camera": kamera siaran langsung yang bisa mengubah
pakaian, benda, warna tembok, dan latar belakang secara real-time hanya dengan perintah
teks. Hasil videonya harus muncul sebagai webcam virtual sehingga bisa dipakai di
TikTok Live, Instagram Live (lewat aplikasi pendukung), YouTube Live, Zoom, Google Meet,
dan OBS.

== CONTOH PERINTAH PENGGUNA SAAT SIARAN ==
"Ubah baju saya menjadi jaket kulit hitam. Ganti tembok di belakang menjadi dinding bata
merah bergaya tua. Ubah cangkir di meja menjadi lampu petromaks yang menyala."

Satu kalimat bisa berisi beberapa perubahan sekaligus. Pengguna juga bisa membatalkan
("kembalikan baju asli"), mengubah sebagian ("jaketnya jadi cokelat"), dan menyimpan
kombinasi sebagai preset.

== FITUR UTAMA ==
1. Pemahaman perintah (Command Parser)
   - Gunakan LLM untuk mengubah kalimat bebas (Bahasa Indonesia dan Inggris) menjadi JSON
     terstruktur. Contoh:
     [{"target":"clothing","region":"upper_body","prompt":"black leather jacket"},
      {"target":"wall","prompt":"old red brick wall, vintage"},
      {"target":"object","query":"cup on the table","prompt":"lit kerosene pressure lantern, glowing"}]
   - Terjemahkan deskripsi ke prompt bahasa Inggris yang optimal untuk model gambar.
   - Saring perintah berbahaya (ketelanjangan, menyamar sebagai tokoh nyata, kekerasan).

2. Ubah Pakaian (Clothing Segmentation + Inpainting)
   - Segmentasi tubuh dan pakaian (atasan, bawahan, luaran) per frame.
   - Deteksi pose (MediaPipe Pose atau DWPose) sebagai panduan ControlNet agar baju baru
     mengikuti bentuk tubuh.
   - Gambar ulang hanya area baju dengan model cepat (StreamDiffusion + LCM-LoRA atau
     SDXL-Turbo/SD-Turbo, img2img 1–4 langkah, resolusi ~512px).
   - Terapkan konsistensi antar-frame (seed tetap, pencampuran dengan frame sebelumnya,
     optical flow) untuk mengurangi kedipan.

3. Ubah Benda (Open-Vocabulary Detection + Object Replacement)
   - Temukan benda dari teks bebas dengan Grounding DINO atau YOLO-World, lalu buat topeng
     dengan SAM 2 / EfficientSAM, dan lacak dengan SAM 2 video tracking.
   - Buat gambar benda pengganti sekali saja (latar transparan), lalu tempel per frame
     mengikuti posisi, ukuran, dan rotasi benda asli.
   - Isi area benda lama yang tidak tertutup (inpainting ringan) agar tidak ada sisa.
   - Bila benda dipegang, tangan harus tetap di depan benda (urutan lapisan yang benar).

4. Ubah Tembok dan Latar (Background / Wall Segmentation)
   - Pisahkan orang dari latar (MediaPipe Selfie Segmentation, RobustVideoMatting, atau
     BiRefNet) dengan tepi rambut yang halus.
   - Mode A "Ganti warna tembok": segmentasi tembok (model ADE20K seperti SegFormer),
     ubah warna/tekstur di area itu dengan menjaga bayangan dan pencahayaan asli. Tanpa
     model gambar per frame.
   - Mode B "Ganti ruangan": buat latar baru SEKALI dengan model gambar, simpan, lalu
     tempel di belakang orang setiap frame. Sesuaikan warna cahaya pada orang agar
     menyatu dengan latar (color matching / relighting ringan).

5. Kamera Virtual
   - Kirim hasil ke webcam virtual: pyvirtualcam (OBS Virtual Camera di Windows/macOS,
     v4l2loopback di Linux), atau plugin OBS.
   - Sediakan juga keluaran NDI/RTMP opsional.
   - Tampilkan pratinjau di aplikasi dengan penanda "AI" yang bisa dilihat penonton.

== SYARAT KINERJA (WAJIB) ==
- Video keluar stabil minimal 24–30 FPS pada 720p; jeda total (kamera ke webcam virtual)
  di bawah 150 ms untuk efek latar/tembok dan di bawah 300 ms untuk efek baju.
- Pipeline asinkron: thread tangkap kamera, thread segmentasi/pelacakan, thread AI
  generatif, thread komposisi + keluaran. Thread keluaran TIDAK PERNAH menunggu AI;
  bila hasil baru belum siap, pakai hasil terakhir.
- Aturan "buat sekali, lacak terus": latar dan benda dibuat sekali per perintah; hanya
  baju yang digambar ulang secara terus-menerus, dengan laju terpisah (misalnya 10–15 FPS)
  lalu diinterpolasi.
- Deteksi benda berat (Grounding DINO) hanya dijalankan saat perintah masuk atau saat
  pelacakan hilang, bukan setiap frame.
- Optimasi: TensorRT / ONNX Runtime, FP16, torch.compile, VAE kecil (TAESD), batch
  denoising, model dimuat sekali di awal dan disimpan di VRAM.
- Mode kualitas otomatis: turunkan resolusi atau laju AI bila FPS turun.
- Mode cloud untuk perangkat tanpa GPU: kirim frame lewat WebRTC ke server GPU,
  terima kembali frame hasil.

== TARGET PERANGKAT ==
- Versi 1: Desktop Windows dengan GPU NVIDIA (RTX 3060 ke atas, VRAM 8 GB+).
- Versi 2: macOS Apple Silicon (Core ML / MPS) dan mode cloud.
- Versi 3: HP Android/iOS: latar dan warna tembok di perangkat, baju dan benda lewat cloud.

== YANG SAYA MINTA DARI KAMU ==
1. Arsitektur sistem lengkap dengan diagram alur data (teks/ASCII) dan alasan pemilihan
   tiap model.
2. Pilihan teknologi (bahasa, framework, model, library) beserta alternatifnya dan
   perkiraan kebutuhan VRAM serta FPS untuk tiap modul.
3. Struktur folder proyek.
4. Rencana kerja bertahap (MVP sampai rilis), dengan target dan kriteria selesai di tiap
   tahap:
   - Tahap 1: kamera -> ganti latar -> webcam virtual.
   - Tahap 2: ganti warna/tekstur tembok.
   - Tahap 3: parser perintah dengan LLM.
   - Tahap 4: ganti benda.
   - Tahap 5: ganti baju.
   - Tahap 6: optimasi, preset, antarmuka, mode cloud.
5. Kode awal yang bisa langsung dijalankan untuk Tahap 1 dan kerangka (interface/class)
   untuk tahap lainnya, termasuk format JSON perintah dan cara modul saling terhubung.
6. Desain antarmuka: kolom ketik perintah, pratinjau, daftar efek aktif (bisa dimatikan
   satu-satu), tombol batal, preset, indikator FPS dan jeda.
7. Daftar risiko teknis (kedipan, tepi kasar, benda hilang dari pelacakan, panas GPU)
   dan cara mengatasinya.
8. Aturan keamanan dan etika: penanda konten AI, filter perintah, larangan meniru
   wajah orang lain, kepatuhan aturan platform siaran.

Jelaskan dengan bahasa yang mudah dipahami, tapi tetap teknis dan tepat. Jika ada bagian
yang tidak realistis untuk real-time dengan teknologi saat ini, katakan dengan jujur dan
berikan alternatif terbaiknya.
```

---

## 3. Prompt pendek (versi ringkas)

Untuk jawaban cepat atau ruang ketik terbatas:

```text
Bertindaklah sebagai Senior Developer. Buatkan rencana kerja, arsitektur, struktur
folder, dan kode awal untuk aplikasi kamera siaran langsung "AI Live Camera". Aplikasi
membaca perintah teks pengguna (Bahasa Indonesia) dengan LLM, lalu secara real-time:
(1) mengganti baju sesuai teks dan mengikuti gerakan tubuh, (2) mengganti benda yang
dipegang atau di meja, (3) mengganti warna tembok dan latar belakang. Hasilnya keluar
sebagai webcam virtual untuk siaran di media sosial. Wajib ringan: pipeline asinkron,
latar dan benda dibuat sekali lalu dilacak, hanya baju yang digambar ulang dengan model
cepat (StreamDiffusion/LCM/SD-Turbo, ~512px), target 30 FPS 720p, jeda di bawah 300 ms.
Mulai dari GPU NVIDIA di Windows. Sertakan tahapan MVP, risiko, dan aturan keamanan.
```

---

## 4. Contoh perintah yang diketik pengguna saat siaran

Perintah ini diketik di dalam aplikasi, bukan ke asisten pemrograman.

**Gabungan (contoh utama)**
- "Ubah baju saya menjadi jaket kulit hitam. Ganti tembok di belakang menjadi dinding bata merah bergaya tua. Ubah cangkir di meja menjadi lampu petromaks yang menyala."

**Pakaian**
- "Ganti kaos saya jadi kemeja batik cokelat lengan panjang."
- "Pakaikan saya jas hitam dengan dasi merah."
- "Ubah hoodie saya jadi seragam pilot."
- "Jaketnya jadi warna cokelat tua." (mengubah efek yang sedang aktif)

**Benda**
- "Ubah botol yang saya pegang jadi mikrofon emas."
- "Ganti pulpen di tangan saya jadi tongkat sihir yang bercahaya biru."
- "Ubah laptop di meja jadi mesin ketik antik."

**Tembok dan warna**
- "Cat tembok di belakang saya jadi hijau sage."
- "Ganti tembok jadi panel kayu jati dengan lampu kuning hangat."
- "Tambahkan lampu neon ungu di tembok."

**Latar penuh**
- "Ganti seluruh ruangan jadi studio berita modern."
- "Pindahkan saya ke kafe kecil di Tokyo saat hujan malam hari."
- "Latar jadi pantai Bali saat matahari terbenam."

**Kontrol**
- "Kembalikan baju asli."
- "Matikan semua efek."
- "Simpan tampilan ini sebagai preset 'Podcast Malam'."
- "Pakai preset 'Podcast Malam'."

---

## 5. Contoh hasil parser (untuk pengembang)

Perintah utama di atas sebaiknya diubah LLM menjadi JSON seperti ini, yang lalu dibaca oleh tiap modul:

```json
{
  "actions": [
    {
      "id": "clothing-1",
      "target": "clothing",
      "region": "upper_body",
      "prompt": "black leather biker jacket, realistic, detailed stitching",
      "mode": "continuous"
    },
    {
      "id": "wall-1",
      "target": "wall",
      "prompt": "old weathered red brick wall, vintage, warm light",
      "mode": "generate_once"
    },
    {
      "id": "object-1",
      "target": "object",
      "query": "cup on the table",
      "prompt": "vintage kerosene pressure lantern, lit, warm glowing flame",
      "mode": "generate_once_track",
      "effects": ["emit_warm_light"]
    }
  ],
  "safety": { "allowed": true }
}
```

`mode` menentukan biaya: `continuous` digambar ulang terus (mahal), `generate_once` dibuat sekali lalu ditempel (murah), `generate_once_track` dibuat sekali lalu ditempel mengikuti pelacakan (sedang).
