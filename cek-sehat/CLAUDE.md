# Cek Sehat Mandiri — Ringkasan Lengkap Proyek

File ini merangkum seluruh percakapan perencanaan aplikasi (7–8 November 2026). Baca semuanya sebelum mulai membangun. Semua teks antarmuka aplikasi memakai Bahasa Indonesia yang sederhana.

---

## 1. Riwayat percakapan (urut)

1. **Ide awal:** aplikasi supaya orang bisa cek kesehatan online tanpa harus ke rumah sakit.
2. **Versi pertama (sudah dibuat, file `cek-sehat.html`):** halaman web dengan
   - *Cek Angka*: IMT, tekanan darah, gula darah, nadi, suhu, dengan hasil berwarna (hijau/kuning/merah) dan saran.
   - *Cek Gejala*: centang tanda bahaya (langsung "Segera ke IGD, telepon 119/112"), keluhan sedang ("ke dokter dalam 24 jam"), keluhan ringan ("rawat di rumah").
3. **Ide "scan tangan" untuk deteksi penyakit:** diputuskan TIDAK dipakai karena tidak ada teknologi yang bisa mendeteksi penyakit secara akurat dari foto atau scan tangan. Penggantinya:
   - Ukur detak jantung lewat kamera HP (PPG: jari menutupi kamera dan flash).
   - Foto bagian tubuh yang terlihat (ruam, bintik merah, luka, mata/kulit kuning, kuku pucat).
4. **AI analisis keluhan:** pengguna menulis keluhan (bisa disertai foto), lalu AI memberi kemungkinan kondisi, penanganan awal, dan kapan harus ke dokter, kemudian bisa dilanjutkan dengan chat. Keputusan: **tanpa angka persen** seperti "98% DBD" karena memberi kesan pasti yang menyesatkan. Gunakan tingkat: *Kemungkinan besar / Mungkin / Kemungkinan kecil* beserta alasannya. Fitur ini sudah ditulis di `cek-sehat.html` (tab "Tanya AI") tetapi belum dipublikasikan.
5. **Data lain untuk deteksi:** laju napas, suara batuk (hanya data tambahan), pertanyaan lanjutan ala dokter, alat ukur di rumah, smartwatch, riwayat penyakit dan obat, foto hasil lab.
6. **Ide panggil dokter ke rumah seperti Gojek dan jaringan rumah sakit.** Di Indonesia sudah ada pemain serupa (Halodoc Homecare, K24Klik home visit, Alodokter chat dokter). Di Amerika juga sudah ada (K Health: AI cek gejala lalu dokter; DispatchHealth: tim medis ke rumah).
7. **Diputuskan untuk dipersempit, bukan dibuang:** fokus ke **dokter langganan + pemantauan pasien jarak jauh** (remote patient monitoring). Sasaran utama: lansia dan pasien kronis (hipertensi, diabetes, jantung).
8. **Alat ukur harus terhubung ke aplikasi** (Bluetooth) supaya dokter bisa memantau dari jauh secara real-time. Kalau kondisi memburuk, dokter datang.
9. **Ditambahkan:** foto makanan untuk nilai gizi, dan misi sehat harian yang menyesuaikan kondisi pengguna.
10. **Fitur pembeda yang disetujui (semua ditambahkan):** asisten suara, mode keluarga, foto obat, peringatan dini, peta waspada lingkungan, menu sehat sesuai kantong, integrasi SATUSEHAT/BPJS.
11. **Tarif kunjungan dokter berdasarkan jarak.** Keadaan darurat (contoh: pingsan di gunung) TIDAK diberi harga melonjak; diarahkan gratis ke 112/Basarnas 115.
12. **Slogan:** "Panggil dokter kapan saja, di mana saja", dengan tiga lapis layanan (lihat bagian 3).
13. **Y Combinator:** berpotensi, tetapi demo saja belum cukup. Tingkat penerimaan YC sekitar 0,6–1%. Pendaftaran W27 sudah tutup 2 November 2026. Yang dibutuhkan: tim (co-founder teknis dan dokter), versi kecil yang dipakai pasien sungguhan, angka traksi, dan fokus pada satu masalah.

---

## 2. Daftar fitur final

### 2.1 Asisten suara AI di beranda
- Satu tombol besar di beranda. Ditekan, AI menyapa dengan suara, pengguna bicara, lalu aplikasi **langsung pindah otomatis** ke fitur yang dimaksud tanpa perlu menekan tombol lain.
  - Contoh: "Aku mau cek detak jantung" langsung membuka layar ukur detak jantung dan mulai memandu.
  - "Kepalaku pusing sejak kemarin" langsung membuka analisis keluhan dengan teks sudah terisi.
  - "Panggil dokter" langsung membuka layar panggil dokter.
- Mendukung Bahasa Indonesia dan bahasa daerah (Jawa, Sunda, dan lainnya). AI menjawab dengan suara.
- Ditujukan terutama untuk lansia yang sulit mengetik.
- Jika ucapan mengandung tanda darurat, langsung tampilkan layar darurat.

### 2.2 AI cek keluhan
- Masukan: teks atau suara, usia, jenis kelamin, suhu, foto bagian tubuh (opsional), angka vital yang ada, gejala yang dicentang.
- Keluaran: 2–4 kemungkinan kondisi dengan tingkat kemungkinan (tanpa persen) dan alasannya, penanganan awal di rumah, tanda kapan harus ke dokter, dan pertanyaan lanjutan.
- Tanda bahaya memunculkan layar merah "Segera ke IGD / 119 / 112".
- Setelah hasil keluar, pengguna memilih: **lanjut chat AI**, **chat/video dokter**, atau **panggil dokter ke rumah**. Ringkasan AI ikut terkirim ke dokter.
- Pertimbangkan penyakit umum di Indonesia (DBD, tifus, ISPA, diare, TBC, malaria di daerah endemis). Jika ada kemungkinan DBD, ingatkan untuk tidak minum ibuprofen/aspirin dan sarankan cek trombosit.
- AI tidak menyarankan antibiotik atau obat keras.

### 2.3 Dokter langganan + pemantauan jarak jauh
- Paket bulanan: pemantauan, chat dokter, dan beberapa kali kunjungan ke rumah.
- Alat ukur Bluetooth memakai profil standar Bluetooth kesehatan (Blood Pressure, Glucose, Pulse Oximeter, Health Thermometer) agar bisa membaca banyak merek.
- Smartwatch lewat Apple HealthKit (iOS) dan Health Connect (Android).
- HP pasien sebagai jembatan: data alat diteruskan ke server secara real-time.
- AI memantau semua data dan hanya memberi tahu dokter jika ada angka berbahaya atau tren memburuk.
- **Dashboard dokter:** daftar pasien dengan status hijau/kuning/merah, grafik tren, tombol chat, video, dan "kunjungi".

### 2.4 Peringatan dini
- Membaca tren, bukan hanya angka hari ini. Contoh: "Tensi naik 3 hari berturut-turut, ada kemungkinan memburuk minggu ini."
- Peringatan dikirim ke pasien, dokter langganan, dan keluarga (jika mode keluarga aktif).

### 2.5 Ukur detak jantung lewat kamera
- PPG: jari menutupi kamera belakang dan flash (torch), sekitar 30 detik.
- Olah sinyal: detrend, band-pass 0,7–3,5 Hz, deteksi puncak dan FFT, skor kualitas sinyal. Jika kualitas buruk, minta ulangi dan jangan tampilkan angka.
- Keterangan bahwa hasil adalah perkiraan.

### 2.6 Foto makanan untuk nilai gizi
- AI memperkirakan kalori, karbohidrat, protein, lemak, serat, gula, dan vitamin/mineral utama.
- Pengguna bisa mengoreksi porsi (½ piring, 1 piring, dan seterusnya).
- Perhatikan minyak, santan, dan gula tersembunyi pada masakan Indonesia.
- Tampilkan sebagai perkiraan.

### 2.7 Misi sehat harian sesuai kondisi
- Kondisi sehat: misi dasar (jalan 6.000 langkah, minum 8 gelas, buah harian bervariasi seperti Senin jeruk dan Selasa pepaya, tidur sebelum jam 11).
- Kondisi tertentu, misi menyesuaikan:
  - Hipertensi: kurangi garam, jalan santai 30 menit, cek tensi pagi dan malam.
  - Diabetes: foto setiap makan untuk cek karbohidrat, jalan 10 menit setelah makan, cek gula.
  - Demam/DBD: minum 2–3 liter, catat suhu setiap 6 jam, istirahat, cek tanda bahaya.
- Data gizi dari foto makanan ikut menentukan misi berikutnya.
- Misi bersifat **pendukung pemulihan, bukan pengganti pengobatan**. Untuk pasien kronis, rencana misi disetujui dokter langganan ("AI menyusun, dokter memastikan").

### 2.8 Menu sehat sesuai kantong
- Rekomendasi makanan lokal sesuai kondisi dan anggaran. Contoh: pasien diabetes dengan anggaran Rp20 ribu mendapat pilihan menu warteg yang aman.

### 2.9 Foto obat
- AI mengenali obat dari foto bungkus, lalu membuat jadwal dan pengingat minum.
- Cek interaksi antarobat.
- Cek apakah obat lazim dipakai untuk penyakit pasien. Jika tidak cocok, peringatannya berbunyi "**tanyakan ke dokter atau apoteker**", jangan pernah "hentikan obat ini". Jika ada dokter langganan, peringatan juga dikirim ke dokter.

### 2.10 Mode keluarga
- Anggota keluarga (misalnya anak yang merantau) bisa melihat angka, kepatuhan minum obat, dan misi orang tuanya, serta menerima notifikasi bahaya.
- Hanya dengan izin pasien.

### 2.11 Cek mingguan + peta waspada lingkungan
- Ajakan cek kondisi minimal seminggu sekali (analisis AI singkat atau konsultasi).
- **Tidak wajib.** Dorong lewat poin dan hadiah (diskon konsultasi, cek lab gratis), laporan kesehatan pribadi, dan status keamanan lingkungan.
- Data **anonim, atas persetujuan, dan diagregasi per kelurahan**. Peta tidak menampilkan individu. Patuhi UU Pelindungan Data Pribadi.
- Contoh peringatan: "Kasus demam meningkat di sekitarmu, waspada DBD." Berguna juga untuk Puskesmas dan Dinas Kesehatan.

### 2.12 Integrasi SATUSEHAT dan BPJS
- Riwayat bisa dibawa saat kontrol ke Puskesmas atau rumah sakit.
- Informasi layanan yang ditanggung BPJS.
- Membutuhkan izin dan kerja sama resmi; dikerjakan di tahap akhir.

### 2.13 Panggil dokter dan darurat
Tiga lapis layanan (slogan: "Panggil dokter kapan saja, di mana saja"):
1. **Video/chat dokter:** 24 jam, seluruh Indonesia, dengan dokter jaga bergiliran.
2. **Dokter ke rumah:** di wilayah yang sudah dilayani. Tampilkan apakah lokasi terjangkau dan estimasi waktu tiba, plus pelacakan perjalanan dokter seperti Gojek.
3. **Darurat di mana saja:** tombol darurat **gratis** yang menghubungi 112 / Basarnas 115, membagikan lokasi GPS, dan dokter memandu lewat video sampai bantuan datang.

**Tarif kunjungan (tidak darurat):** tarif dasar dalam radius tertentu (misalnya 5 km), tambahan per km, tambahan untuk malam/hari libur/lokasi sulit, diskon atau gratis untuk pelanggan dokter langganan. **Tidak ada lonjakan harga untuk keadaan darurat.**

---

## 3. Aturan keselamatan dan kejujuran (wajib)
- Aplikasi tidak memberi diagnosis pasti. Gunakan kalimat seperti "kemungkinan" dan "sebaiknya periksa ke dokter", jangan "Anda menderita…".
- Tidak ada angka persen kepastian penyakit.
- Tidak ada fitur yang mengklaim mendeteksi penyakit dari scan atau foto tangan.
- Banner "Darurat? 119 / 112" selalu terlihat.
- Data kesehatan termasuk data sensitif: enkripsi, izin eksplisit, dan anonimisasi untuk data agregat.
- Dokter mitra wajib memiliki STR dan SIP aktif.

## 4. Positioning dan bisnis
- Fitur-fitur ini satu per satu sudah ada di aplikasi lain. Nilai uniknya adalah **gabungannya untuk pasar Indonesia**, dengan fokus pada pasien kronis dan lansia.
- Strategi: jadi yang terbaik untuk satu kelompok (misalnya pasien hipertensi dan diabetes di satu kota), lalu Indonesia, lalu lebih luas.
- Kebutuhan non-teknis: badan usaha, izin penyelenggara layanan kesehatan digital dari Kemenkes, pendaftaran PSE, kerja sama resmi dengan rumah sakit dan klinik, kepatuhan UU PDP. Detail perizinan dicek ke Kemenkes atau konsultan hukum.
- Persiapan Y Combinator: co-founder teknis dan dokter, versi kecil dengan 50–100 pasien sungguhan, angka traksi (pengguna aktif mingguan, hasil kesehatan pasien).

## 5. Rencana pembangunan (bertahap)

**Teknologi yang disarankan:** React Native (Expo) untuk aplikasi pasien (dibutuhkan untuk Bluetooth, kamera/torch, HealthKit/Health Connect), Next.js untuk dashboard dokter, backend Supabase/Postgres (atau setara) dengan Row Level Security, dan Claude API untuk AI (analisis keluhan, foto makanan/obat, suara, triase). Semua teks dalam Bahasa Indonesia.

1. **Tahap 1 — Prototipe demo** (untuk investor dan dokter mitra): aplikasi pasien dan dashboard dokter dengan data alat yang disimulasikan, dokter dan rumah sakit fiktif bertanda "DEMO".
2. **Tahap 2 — MVP fokus:** dokter langganan + pemantauan tensi dan gula lewat alat Bluetooth + peringatan dini + AI cek keluhan + mode keluarga + tombol darurat. Uji coba dengan 50–100 pasien dan beberapa dokter.
3. **Tahap 3:** asisten suara (Indonesia dulu, lalu bahasa daerah), foto obat, foto makanan, misi harian, menu sesuai kantong.
4. **Tahap 4:** dokter ke rumah dengan tarif jarak dan pelacakan, cek mingguan, peta waspada lingkungan.
5. **Tahap 5:** integrasi SATUSEHAT dan BPJS.

Setiap tahap: tulis unit test untuk semua logika klasifikasi dan triase (termasuk nilai batas), jalankan test, dan pastikan lulus sebelum lanjut.

## 6. Ambang angka yang dipakai (versi pertama)
- **IMT (Kemenkes):** <17 kurus berat, 17–18,4 kurus, 18,5–25 normal, 25,1–27 gemuk, >27 obesitas.
- **Tekanan darah (AHA):** normal <120/<80; sedikit tinggi 120–129/<80; tahap 1 130–139 atau 80–89; tahap 2 ≥140 atau ≥90; krisis >180 atau >120; rendah <90/<60.
- **Gula darah (mg/dL):** puasa normal <100, prediabetes 100–125, tinggi ≥126; sewaktu atau 2 jam setelah makan normal <140, agak tinggi 140–199, tinggi ≥200; <70 terlalu rendah; ≥300 sangat tinggi.
- **Nadi istirahat:** <50 lambat, 50–100 normal, 101–120 cepat, >120 perlu diperiksa hari ini.
- **Suhu:** <35 hipotermia, ≤37,5 normal, 37,6–37,9 hangat, 38–39,9 demam, ≥40 sangat tinggi.

Ambang ini sebaiknya ditinjau oleh dokter mitra sebelum dipakai untuk pasien sungguhan.

## 7. File terlampir
- `cek-sehat.html`: versi pertama (Cek Angka, Cek Gejala, dan tab Tanya AI). Tab Tanya AI memakai API khusus halaman Claude (`claude.use("sample")`); di aplikasi sungguhan, ganti dengan panggilan ke Claude API lewat backend.
