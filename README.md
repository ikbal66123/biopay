# BioPay & E-Wallet Ecosystem

Prototipe web (satu file `index.html`) yang mensimulasikan pembayaran biometrik (scan wajah + telapak tangan) dari tiga sudut pandang:

- **POV 1 – Mesin Terminal BioPay**: login biometrik, pembayaran merchant lokal & internasional (Auto-FX + Tax Refund turis), dashboard (Top Up, Transfer, Tarik Tunai, Tagihan, Tukar Valas, Wallets, Riwayat, Bio-Pass, Sharing keluarga, Pengaturan & bahasa ID/EN/JP).
- **POV 2 – Aplikasi E-Wallet**: Top Up, Minta (QRIS), Kirim, bayar layanan (Pulsa, PLN, PDAM, BPJS, dll.), menagih pelanggan via BioPay, dan mini-app BioPay.
- **POV 3 – Aplikasi travel Lintas**: cari & pesan pesawat, hotel, kereta, dan atraksi (urutkan hasil, isi data penumpang, tambahan bagasi/asuransi/sarapan, kode promo), bayar dengan Lintas Pay / BioPay (scan wajah + telapak) / virtual account, e-tiket dengan kode booking, daftar pesanan, batal & refund, top up Lintas Pay, dan tombol BioPay dengan tiga pilihan yang sama seperti POV 2 (Tagih Pelanggan, Tampilkan QRIS Saya, Masuk ke BioPay).

BioPay di POV 2 dan POV 3 dibangun otomatis dari layar POV 1 (`createBioPay`), dan fitur BioPay merchant di POV 3 disalin dari POV 2 (`createMerchantKit`), sehingga tampilan dan perilakunya selalu sama.

Semua data adalah simulasi (tanpa uang sungguhan, tanpa server).

## Cara menjalankan

Buka `index.html` langsung di browser (Chrome/Edge/Firefox). Butuh koneksi internet untuk Tailwind CSS, font, dan ikon dari CDN.

Kamera hanya bisa diakses dari `file://`, `localhost`, atau HTTPS. Untuk mencoba di HP, jalankan server lokal lalu buka lewat HTTPS (atau GitHub Pages):

```bash
python3 -m http.server 8000
```

Jika izin kamera ditolak, alur tetap berjalan (scan disimulasikan).

## TAO Group OS

`tao-group-os.html` adalah aplikasi **TAO Group Global Hospitality OS – Edisi Mewah**: portofolio cabang global, Live Hub, VIP Ops, Leaderboard, T-Community, Event, Escrow, DJ Request, Menu F&B, dan Mini Games. Buka langsung di browser (butuh internet untuk Tailwind, ikon, font, dan foto).

### Fitur

- **Menu F&B & keranjang**: tambah item, atur jumlah, catatan untuk host, service charge 10%, kirim pesanan ke meja, lalu status pesanan diperbarui otomatis (Diterima → Disiapkan → Dalam Perjalanan → Diantar). Tombol keranjang mengambang muncul saat ada isi.
- **Tagihan meja**: rincian pesanan, kekurangan minimum spend, tip 0/10/15/20%, split bill 1–10 orang, bayar dengan T-Gold (1 T-Gold = $1), lalu dapat cashback 3%.
- **Tiket event**: 6 event, 3 kelas tiket, 1–6 tiket, bayar T-Gold, tiket dengan kode & QR, dan halaman *Tiket Saya*.
- **Mini games yang bisa dimainkan**: Live Club Trivia (5 soal berwaktu), The Kinetic Pulse (game ritme, ketuk atau Spasi), dan Truth or Dare dengan voting. Hadiah T-Gold sesuai skor.
- **Cabang dengan indikator keramaian** (Santai / Ramai / Sangat Ramai) dan bar kapasitas.
- **Pencarian cepat**: tekan `Ctrl/⌘ + K` atau `/` (atau tombol *Cari*) untuk lompat ke halaman, cabang, item menu, atau aksi.
- **Tersimpan otomatis**: saldo T-Gold, keranjang, dan tiket tetap ada setelah halaman di-refresh (disimpan di browser).
- **Chat yang lebih hidup & aman**: T-Community membalas pesan, dan teks pengguna di chat, DM, dan request lagu tidak lagi dibaca sebagai HTML.
- **Tampilan HP**: header muat di layar 375px, dengan saldo T-Gold ringkas.

### Lapisan visual

Mengikuti panduan skill `ui-ux-pro-max` (`<style id="lux-layer">`): butiran film halus, cahaya hangat yang mengikuti kursor, garis emas di header, panel kaca, tombol emas bernuansa logam, animasi pindah tab dan modal, efek tekan, fokus keyboard yang jelas, dan semua animasi mati jika sistem meminta *reduce motion*.
