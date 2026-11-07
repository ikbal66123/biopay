# Rencana Riset Cek Sehat Mandiri

**Tujuan besar:** membuat HP biasa bisa membantu memantau kesehatan di rumah, dengan bukti ilmiah, supaya orang
tahu kapan harus ke fasilitas kesehatan sebelum terlambat.

Prinsip: setiap fitur baru masuk ke aplikasi publik **hanya setelah terbukti** lewat uji pada manusia. Sampai
saat itu, fitur hanya dipakai di Mode Riset di bawah pengawasan tim.

---

## Fase 1: Validasi detak jantung kamera (bisa dimulai sekarang)

### Pertanyaan
Seberapa dekat hasil detak jantung dari kamera HP dengan oksimeter jari, pada orang Indonesia dengan usia, warna
kulit, dan merek HP yang beragam?

### Kenapa ini dulu
Semua fitur lanjutan (termasuk Fase 2) memakai detak jantung kamera. Kalau dasarnya belum terbukti akurat,
semua di atasnya ikut tidak bisa dipercaya.

### Desain
- **Jenis:** studi validasi, membandingkan dua metode ukur (kamera vs oksimeter) pada saat yang sama.
- **Peserta:** minimal 50 orang dewasa, dengan sebaran:
  - usia 18–39, 40–59, dan ≥60 tahun,
  - warna kulit terang, sedang, gelap (cahaya flash menembus kulit secara berbeda),
  - minimal 5 merek atau model HP berbeda, termasuk HP harga terjangkau dan iPhone (tanpa flash otomatis).
- **Per peserta:** 3 pengukuran saat istirahat dan 1 setelah naik-turun tangga 1 menit (detak lebih tinggi).
  Total ≥ 200 pasangan data.
- **Alat pembanding:** oksimeter jari yang sudah memiliki izin edar, dipasang di tangan lain.
- **Alat yang dipakai:** Mode Riset di aplikasi ini (Riwayat → Mode Riset). Aplikasi menyimpan sinyal mentah
  kamera, hasil aplikasi, angka pembanding, dan data peserta tanpa nama.

### Ukuran keberhasilan
| Ukuran | Target |
|---|---|
| Selisih dalam standar ANSI/AAMI EC13 (≤ 5 bpm atau ≤ 10%) | ≥ 90% pasangan |
| Bias rata-rata | dalam ±3 bpm |
| Batas kesepakatan 95% (Bland-Altman) | dalam ±10 bpm |
| Pengukuran yang ditolak aplikasi | < 20% |
| Akurasi per kelompok warna kulit dan merek HP | tidak ada kelompok yang jauh lebih buruk |

Pengukuran yang ditolak aplikasi tetap dicatat dan dilaporkan. Algoritma yang "akurat" karena menolak semua
pengukuran sulit tidak berguna.

### Analisis
1. Ekspor "Data lengkap" (JSON) dari setiap HP pengumpul data.
2. Hitung bias, batas kesepakatan, MAE, dan persentase AAMI, keseluruhan dan per kelompok.
3. Jika ada kelompok yang buruk (misalnya kulit gelap atau HP tertentu), sinyal mentahnya dipakai untuk
   memperbaiki algoritma, lalu diuji ulang pada **peserta baru**, bukan peserta yang sama.

### Kebutuhan
- 3–5 oksimeter jari ber-izin edar (sekitar Rp150–300 ribu per unit)
- 2–3 orang pengumpul data
- Persetujuan Komisi Etik Penelitian Kesehatan (KEPK) dari universitas atau rumah sakit mitra
- Lembar penjelasan dan persetujuan peserta (informed consent)

Perkiraan waktu: 1–2 bulan termasuk pengurusan etik.

---

## Fase 2: Pemantauan pasien DBD di rumah (ide utama)

### Masalahnya
Banyak pasien demam berdarah dengue (DBD) dirawat jalan. Bahaya terbesar justru muncul saat **demam mulai
turun** (sekitar hari ke-3 sampai ke-7, disebut fase kritis): cairan darah bisa merembes keluar pembuluh dan
pasien bisa jatuh ke syok. Di rumah, keluarga sering tidak sadar tanda-tandanya karena pasien "kelihatan
membaik" saat demam turun.

### Idenya
Aplikasi **tidak mendeteksi DBD**. Diagnosis tetap lewat cek darah oleh tenaga kesehatan. Aplikasi membantu
**memantau pasien yang sudah didiagnosis DBD** selama fase kritis, dengan data yang bisa diambil di rumah:
- detak jantung dari kamera, 2–3 kali sehari (detak yang makin cepat saat istirahat bisa jadi tanda awal syok),
- suhu dari termometer,
- tekanan darah, jika ada tensimeter (selisih angka atas dan bawah yang makin sempit, ≤ 20 mmHg, adalah
  tanda bahaya),
- daftar tanda bahaya harian sesuai pedoman WHO/Kemenkes: nyeri perut, muntah terus, perdarahan gusi atau
  mimisan, sangat lemas atau gelisah, jarang buang air kecil,
- jumlah minum dan buang air kecil.

Jika muncul tanda bahaya, aplikasi langsung menyuruh ke IGD. Pertanyaan risetnya adalah apakah **pola
gabungan** data harian ini bisa memberi peringatan **lebih awal** dibanding menunggu keluhan berat.

### Pertanyaan riset
1. Apakah pasien dan keluarga mampu melakukan pemantauan ini dengan benar di rumah? (kelayakan)
2. Apakah perubahan tren detak jantung kamera dan tanda harian mendahului kebutuhan rawat inap atau tanda
   kebocoran plasma? Berapa jam lebih awal?
3. Berapa sering aplikasi memberi peringatan palsu?

### Desain
- **Jenis:** studi kohort prospektif observasional. Aplikasi hanya mencatat; keputusan medis tetap oleh dokter
  sesuai standar biasa, sehingga peserta tidak dirugikan.
- **Peserta:** pasien DBD terkonfirmasi (NS1 atau serologi) yang dirawat jalan di Puskesmas atau RS mitra,
  dipantau sampai hari ke-7 sakit atau sampai sembuh.
- **Hasil yang dibandingkan:** rawat inap, tanda kebocoran plasma (hematokrit naik dan trombosit turun cepat),
  atau syok, berdasarkan rekam medis.
- **Jumlah peserta:** ditentukan bersama ahli statistik mitra; studi kelayakan awal biasanya 50–100 pasien.

### Syarat sebelum mulai
- Fase 1 lulus (detak jantung kamera terbukti akurat).
- Mitra klinis: dokter penyakit dalam atau anak di Puskesmas atau RS di daerah dengan banyak kasus DBD.
- Persetujuan etik KEPK.
- Mode Riset untuk DBD di aplikasi (formulir harian, pengingat jadwal ukur, ekspor data). Ini dibangun setelah
  protokol disetujui mitra, supaya isinya sesuai kebutuhan klinis.

---

## Fase 3: Menuju fitur publik

Jika Fase 2 menunjukkan manfaat:
1. Uji klinis yang lebih besar dengan pembanding (kelompok yang memakai aplikasi vs yang tidak).
2. Daftarkan sebagai alat kesehatan berbasis perangkat lunak ke Kemenkes untuk mendapat izin edar.
3. Baru setelah itu fitur pemantauan DBD dibuka untuk umum, tetap dengan anjuran periksa ke dokter.

---

## Langkah minggu ini

1. Beli 1–2 oksimeter jari ber-izin edar.
2. Uji coba Mode Riset pada diri sendiri dan keluarga (data latihan, belum untuk publikasi), minimal 30
   pasangan data. Kirim hasil ekspor "Data lengkap" untuk dianalisis dan memperbaiki algoritma.
3. Hubungi 2–3 calon mitra: fakultas kedokteran, Puskesmas, atau dosen kesehatan masyarakat. Bawa dokumen
   ini dan demo aplikasinya.
4. Bersama mitra, susun protokol Fase 1 dan ajukan ke KEPK.
