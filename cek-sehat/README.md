# Cek Sehat Mandiri

Aplikasi web (PWA) untuk membantu memahami kondisi kesehatan dari rumah dan tahu kapan harus ke dokter atau IGD.
**Bukan alat diagnosis dan bukan pengganti dokter.**

- **Detak Jantung**: perkiraan detak jantung dengan kamera belakang dan flash (PPG)
- **Cek Angka**: IMT (Kemenkes RI), tekanan darah (AHA), gula darah, suhu tubuh, nadi manual
- **Cek Gejala**: triase tanda bahaya → IGD, keluhan sedang → dokter dalam 24 jam, keluhan ringan → rawat di rumah
- **Riwayat**: grafik tren 7/30 hari, hapus per entri atau semua, ekspor CSV untuk dokter

Semua data disimpan di `localStorage` perangkat. Tidak ada server, tidak ada login, dan tidak ada data yang dikirim
keluar dari perangkat. Setelah dibuka sekali, aplikasi berjalan offline (service worker).

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
