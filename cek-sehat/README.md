# Cek Sehat Mandiri

Aplikasi web (PWA) untuk membantu memahami kondisi kesehatan dari rumah dan tahu kapan harus ke dokter atau IGD.
**Bukan alat diagnosis dan bukan pengganti dokter.**

- **Detak Jantung**: perkiraan detak jantung dengan kamera belakang dan flash (PPG)
- **Cek Angka**: IMT (Kemenkes RI), tekanan darah (AHA), gula darah, suhu tubuh, nadi manual
- **Cek Gejala**: triase tanda bahaya → IGD, keluhan sedang → dokter dalam 24 jam, keluhan ringan → rawat di rumah
- **Riwayat**: grafik tren 7/30 hari, hapus per entri atau semua, ekspor CSV untuk dokter
- **Mode Riset** (dari Riwayat, atau `#riset`): uji akurasi detak jantung kamera terhadap oksimeter, dengan
  analisis Bland-Altman dan ekspor sinyal mentah. Rencana risetnya ada di [`riset/PROPOSAL.md`](riset/PROPOSAL.md)

Fitur tambahan (rencana di `CLAUDE.md` proyek, tahap 1 "prototipe demo"):

| Fitur | Status |
|---|---|
| **Beranda + asisten suara**: bicara atau ketik, aplikasi langsung pindah ke fitur yang dimaksud; kata darurat langsung membuka layar darurat. Indonesia, Jawa, Sunda | Berjalan (pengenalan suara memakai layanan browser) |
| **Tombol darurat**: 112, 119, Basarnas 115, ambil & kirim lokasi GPS, panduan pertolongan pertama. Gratis, tanpa tarif | Berjalan |
| **Tanya AI**: keluhan + foto + data vital → 2–4 kemungkinan (tanpa persen), penanganan awal, kapan ke dokter, lalu chat | Berjalan setelah server AI aktif |
| **Foto makanan** (perkiraan gizi, koreksi porsi) dan **foto obat** (jadwal, interaksi, "tanyakan ke dokter atau apoteker") | Berjalan setelah server AI aktif; jadwal & pengingat obat berjalan tanpa AI |
| **Peringatan dini** dari tren riwayat (tensi naik 3 hari, gula tinggi berulang, demam 3 hari, demam turun pada DBD, dll.) | Berjalan |
| **Misi harian** sesuai kondisi, poin, cek mingguan | Berjalan (hadiah: DEMO) |
| **Menu sehat sesuai kantong** (warteg/masakan rumah) | Berjalan |
| **Alat ukur Bluetooth** (standar Bluetooth kesehatan: tensi, gula, suhu, oksimeter, timbangan, detak) | Berjalan di Chrome Android/komputer; iPhone belum |
| **Mode keluarga**: kirim kabar & peringatan lewat WhatsApp, dengan izin | Berjalan (notifikasi otomatis butuh server) |
| **Panggil dokter**: chat/video, dokter ke rumah dengan tarif jarak & pelacakan, darurat | DEMO (dokter fiktif, contoh tarif) |
| **Dashboard dokter** hijau/kuning/merah | DEMO (pasien fiktif) |
| Peta waspada lingkungan, SATUSEHAT/BPJS, HealthKit/Health Connect, dokter langganan sungguhan | Belum: butuh server, izin, dan mitra |

Data kesehatan disimpan di perangkat (`localStorage`/IndexedDB), tanpa login. Yang keluar dari HP hanya apa yang
pengguna kirim sendiri: ke server AI (setelah persetujuan), ke WhatsApp keluarga, atau file ekspor. Setelah dibuka
sekali, aplikasi berjalan offline kecuali fitur AI dan pengenalan suara.

## Mengaktifkan server AI

Fitur AI memanggil Claude lewat Netlify Function `netlify/functions/ai.mts` (`/api/ai`), sehingga API key tidak
pernah ada di HP. **Netlify Drop (seret folder) tidak bisa**, karena hanya mengunggah aplikasi tanpa server.

1. Buat API key di <https://console.anthropic.com> (bayar sesuai pemakaian).
2. Di Netlify: **Add new site → Import an existing project → GitHub**, pilih repo ini dan branch-nya,
   **Base directory** `cek-sehat`. Pengaturan build dibaca dari `netlify.toml`.
3. **Site configuration → Environment variables**: tambahkan `ANTHROPIC_API_KEY`. Disarankan juga
   `APP_ACCESS_CODE` (kode bebas) agar orang lain tidak memakai kredit Anda; isi kode yang sama di aplikasi:
   Profil → Kode akses server AI.
4. Deploy ulang. Model yang dipakai: `claude-opus-5-5`, dengan fallback otomatis jika permintaan ditolak.

## Menjalankan

Perlu Node.js 18 atau lebih baru.

```bash
cd cek-sehat
npm install
npm run dev        # http://localhost:5173 (kamera bisa dipakai di komputer ini)
npm test           # unit test (Vitest)
npm run build      # hasil di dist/
npm run preview    # menjalankan hasil build
```

## Mencoba di HP

Browser hanya mengizinkan kamera di **HTTPS** atau **localhost**. Alamat seperti `http://192.168.1.10:5173` tidak
bisa memakai kamera. Ada tiga cara:

### 1. HTTPS lokal lewat Wi-Fi (paling cepat)

```bash
npm run dev:hp
```

Perintah ini menjalankan `vite --host` dengan sertifikat HTTPS buatan sendiri (`@vitejs/plugin-basic-ssl`).
Pastikan HP dan komputer tersambung ke Wi-Fi yang sama, lalu buka alamat **Network** yang muncul di terminal, misalnya
`https://192.168.1.10:5173`. Browser akan memperingatkan bahwa sertifikat tidak dikenal: pilih *Lanjutan →
Lanjutkan ke situs*. Cocok untuk mencoba kamera. Untuk install PWA dan mode offline, pakai cara 2 karena service
worker butuh sertifikat yang dipercaya.

### 2. Deploy ke Vercel atau Netlify (gratis, HTTPS asli)

- **Vercel**: *Add New Project* → pilih repository ini → **Root Directory** `cek-sehat` → Framework *Vite*
  (build `npm run build`, output `dist`) → Deploy.
- **Netlify**: *Add new site* → pilih repository → **Base directory** `cek-sehat`, build command `npm run build`,
  publish directory `cek-sehat/dist` → Deploy. Atau tanpa Git: `npm run build` lalu seret folder `dist` ke
  <https://app.netlify.com/drop>.

Buka alamat `https://…` di HP. Untuk memasang ke layar utama:
- **Android (Chrome)**: menu ⋮ → *Instal aplikasi* / *Tambahkan ke layar utama*.
- **iPhone (Safari)**: tombol Bagikan → *Tambah ke Layar Utama*.

### 3. Lewat kabel USB (Android)

Sambungkan HP ke komputer, aktifkan *USB debugging*, buka `chrome://inspect/#devices` di Chrome komputer, lalu
atur **Port forwarding** `5173 → localhost:5173`. Di HP buka `http://localhost:5173`; karena alamatnya localhost,
kamera boleh dipakai tanpa HTTPS.

## Tentang pengukuran kamera

Ujung jari menutupi kamera belakang dan flash. Setiap denyut mengubah sedikit jumlah darah di ujung jari, sehingga
warna merah gambar ikut naik turun. Langkah pengolahannya (`src/lib/ppg.ts`):

1. Rata-rata kanal merah dari bagian tengah gambar, sekitar 30 kali per detik (kanal hijau dipakai jika merah jenuh di 255)
2. Resample ke 30 Hz, hilangkan tren (detrend), band-pass Butterworth 0,7–3,5 Hz (42–210 bpm) tanpa pergeseran fase
3. BPM dari jarak antar puncak, dicek ulang dengan FFT
4. Skor kualitas dari konsentrasi spektrum, keteraturan denyut, kecocokan kedua metode, dan kestabilan amplitudo
   (gerakan atau tekanan jari yang berubah). Jika di bawah ambang, angka **tidak ditampilkan** dan pengguna diminta mengulang

Flash dinyalakan dengan `applyConstraints({ advanced: [{ torch: true }] })`. Safari di iPhone belum mendukung
torch, sehingga aplikasi meminta pengguna mengukur di tempat terang. Kamera dan flash dimatikan saat pengukuran
selesai, dibatalkan, pindah tab, atau aplikasi ditinggalkan.

Hasilnya perkiraan dan tidak seakurat oksimeter atau EKG.

## Pengujian

```bash
npm test
```

- `classify.test.ts`: semua klasifikasi (IMT, tekanan darah, gula darah, suhu, nadi) termasuk nilai batas, serta
  pemeriksaan bahwa tidak ada kalimat diagnosis
- `triage.test.ts`: triase gejala (satu tanda bahaya → IGD, kelompok terberat menang)
- `ppg.test.ts`: sinyal sinus sintetis dengan noise, drift, dan waktu frame tidak rata (72 bpm terbaca 70–74;
  48–160 bpm dalam ±2), harmonik kuat, 15 fps, kanal merah jenuh, serta penolakan sinyal noise atau gerakan
- `history.test.ts`: simpan, hapus, ekspor CSV, data grafik tren

## Struktur

```
src/
  lib/        logika murni + test (classify, triage, ppg, history, camera)
  pages/      empat tab: HeartRatePage, CheckNumbersPage, SymptomsPage, HistoryPage
  components/ banner darurat, kartu hasil, grafik tren, ikon
```

Nomor darurat: **119** (ambulans/gawat darurat), **112** (panggilan darurat).
