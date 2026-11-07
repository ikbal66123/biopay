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
