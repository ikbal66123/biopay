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

### Peta Global

Tab **Peta Global** menampilkan semua cabang TAO Group di globe 3D (MapLibre GL 5.24 dengan peta dasar CARTO Dark Matter: nama negara, kota, sampai jalan).

- **Data cabang nyata**: 47 venue di 15 kota dan 9 negara, plus Hakkasan Muscat yang segera dibuka. Mereknya TAO, Hakkasan, OMNIA, Marquee, LAVO, Beauty & Essex, Avenue, Yauatcha, Ling Ling, dan lainnya. Disusun dari taogroup.com, hakkasangroup.com, dan pemberitaan per November 2026 (`TAO_VENUES` di dalam file). Koordinat menunjuk ke gedung atau area venue. Data yang sama dipakai di seluruh aplikasi.
- **Realtime**: jam setempat dan status buka atau tutup setiap venue dihitung langsung dari zona waktu kotanya, dengan jam operasional umum per jenis venue (perkiraan), dan diperbarui tiap 30 detik.
- **Pencarian**: cari nama venue, merek, kota, negara, atau area (misalnya "hakkasan", "singapura", "caesars"). Pilih hasilnya, peta terbang ke sana.
- **Penanda**: dari jauh, kota yang berdekatan digabung (misalnya "Las Vegas +2"). Ketuk untuk memperbesar ke kota itu, lalu ketuk titik venue.
- **Kartu venue**: foto, area, jam setempat, status, tombol **Persiapan kunjungan** (masuk ke alur reservasi yang sama dengan portofolio), dan **Petunjuk arah** (Google Maps).
- Tampilan globe atau datar, tombol *Lihat dunia*, dan daftar cabang per negara dan kota.

Peta butuh internet (unpkg.com untuk MapLibre, basemaps.cartocdn.com untuk peta dasar) dan tetap jalan saat file dibuka langsung tanpa server.

### Desain

Sistem desain lengkap (warna, huruf, tata letak, gerak, komponen, gaya bahasa) ada di [`DESIGN.md`](DESIGN.md). Skill desain yang dipakai ada di `.claude/skills/` (lihat `.claude/skills/SOURCES.md`): `frontend-design`, `taste-skill`, `web-design-guidelines`, `ui-ux-pro-max`, dan `playwright-cli`.

- **Huruf**: Bodoni Moda untuk judul, Jost untuk teks.
- **Halaman depan**: foto venue, satu kalimat jelas, dan papan *Paling ramai malam ini* berisi 5 venue langsung (sisa meja atau daftar tunggu) yang bisa diketuk.
- **Bebas ciri template**: tanpa label huruf kapital di atas judul, tanpa teks "A · B", tanpa aksen satu kata di judul, tanpa panah di tombol, tanpa efek miring atau kilau yang terus bergerak.
- **Gerak**: satu momen saat halaman dibuka (intro dan teks hero); sisanya hanya menjawab aksi pengguna.
- **Aksesibilitas**: skip link, `color-scheme: dark`, `theme-color`, elemen klik non-tombol bisa dipakai dengan keyboard, dan teks kecil minimal 11,5px.

### Tema Monaco Emerald

Gaya *old money* / billionaire yang elegan dan segar: dial jam mewah, kapal pesiar, dan klub privat.

- **Palet**: zamrud tua (`#050C0A`, `#0F5E49`, `#2FA37F`), emas champagne (`#D9BE86`), dan putih mutiara (`#F5F1E8`). Skala `neutral` dan `gray` Tailwind diganti sehingga seluruh aplikasi ikut berubah. Kontras teks 5,1:1 sampai 17:1. Merah ruby (`#B4233C`) hanya dipakai untuk peringatan.
- **Latar**: gradasi zamrud dalam dengan cahaya champagne yang lembut, cahaya yang mengikuti kursor, dan pola guilloché halus (ukiran pada dial jam mewah dan uang kertas).
- **Ornamen**: cincin bezel emas tipis dengan penanda menit yang berputar pelan di intro, hero, dan Malam Saya.
- **Tab aktif** berwarna zamrud dengan huruf mutiara; garis header zamrud-champagne.

### Fitur Signature

- **Malam Saya** (tab baru): antrean pintu digital (nomor, posisi langsung, jalur prioritas Black Card, QR saat giliran tiba), lagu yang sedang diputar dari DJ booth, dan misi malam ini.
- **Misi malam ini**: 6 misi (meja, antrean, pesanan, Bottle Show, mini game, tiket) yang otomatis tercatat saat tamu melakukannya, dengan hadiah T-Gold. Direset tiap hari.
- **Profil preferensi tamu**: nama panggilan, minuman favorit, alergi, ulang tahun, dan musik favorit. Dipakai Concierge untuk menyapa dan memberi rekomendasi, muncul sebagai peringatan alergi di keranjang, dan tampil di dashboard manajemen sebagai *Catatan tamu untuk host*.
- **Rekap malam**: kartu ringkasan malam (belanja, item, Bottle Show, misi, lagu) yang bisa dibagikan.
- **Tur fitur 60 detik**: tur berpemandu 8 langkah dengan sorotan (tombol *Tur Fitur* di navigasi dan hero), cocok untuk presentasi.

### Edisi Mewah

- **Intro pembuka**: monogram TAO emas muncul dari blur, lalu tirai terangkat (sekali per sesi, bisa di-skip dengan ketukan).
- **Hero sinematik** di halaman utama: foto bergerak pelan, judul serif yang muncul baris per baris, statistik yang menghitung naik.
- **Tipografi** Cormorant Garamond (judul) + Plus Jakarta Sans (teks), mengikuti rekomendasi *Luxury Serif* dari skill `ui-ux-pro-max`.
- **Kartu member digital** Black Card: kartu logam dengan kilau holografik, bisa dibalik untuk QR, progres poin menuju tingkat berikutnya.
- **Bottle Show Experience**: pilih paket, tulis pesan di papan LED, atur waktunya, lalu tonton perayaan layar penuh (sparkler & confetti emas).
- **TAO Concierge**: asisten chat yang menjawab soal rekomendasi, dress code, reservasi, event, jemputan, dan tagihan, lengkap dengan tombol aksi.
- **Dashboard Manajemen** (tab *Manajemen*), untuk tim operasional: KPI live (pendapatan, tamu, okupansi, spend per meja), grafik pendapatan per jam, komposisi pendapatan, antrean pesanan, kedatangan VIP, dan okupansi venue. Data diperbarui tiap 3 detik.
- **Gerak**: perpindahan halaman sinematik, kartu muncul berurutan, kartu miring 3D dengan kilau cahaya (desktop), dan tombol emas dengan kilau melintas. Semua animasi mati jika sistem meminta *reduce motion*.

Semua angka bisnis di dashboard adalah data simulasi untuk demo.

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
