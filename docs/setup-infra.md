# Panduan memasang infrastruktur BioPay

Kode di repo ini sudah siap untuk backend sungguhan. Selama kunci belum diisi, aplikasi berjalan dalam **mode demo** (semua data di browser). Begitu kunci diisi di Vercel, aplikasi otomatis **terhubung ke server**; di halaman depan tertulis "Terhubung" atau "Mode demo".

| Layanan | Untuk apa | Biaya awal |
|---|---|---|
| GitHub | Kode & riwayat perubahan, tes otomatis tiap push | Gratis |
| Supabase | Database, login, keamanan per pengguna, memori asisten (vektor) | Gratis (paket Free) |
| Vercel | Hosting + API (`/api/health`, `/api/config`, `/api/receipt`) | Gratis (Hobby) |
| Namecheap | Membeli domain | ±US$10–15/tahun |
| Cloudflare | DNS domain | Gratis |
| Resend | Email verifikasi & struk | Gratis (kuota kecil) |
| Sentry | Pelacakan error | Gratis (Developer) |
| UptimeRobot | Memantau situs 24 jam | Gratis |

Harga dan kuota bisa berubah; cek halaman harga tiap layanan.

**Aturan keamanan (wajib):**
- Aktifkan **2FA** di semua akun di atas.
- **Jangan pernah** mengirim API key atau password lewat chat, email, atau commit ke GitHub. Isi hanya di menu pengaturan layanan.
- Kunci `service_role` Supabase **tidak boleh** dipakai di browser atau ditaruh di repo.

---

## 1. Supabase (database + login)

1. Daftar di supabase.com, **New project**. Pilih region **Southeast Asia (Singapore)**, yang paling dekat dengan Indonesia. Simpan password database di password manager.
2. Buka **SQL Editor**, tempel seluruh isi `supabase/migrations/20261114000001_init.sql`, lalu **Run**. Ini membuat semua tabel dan aturan keamanan (setiap pengguna hanya bisa melihat datanya sendiri).
3. **Authentication → Providers → Email**: aktif, dan **Confirm email** dinyalakan.
4. **Authentication → URL Configuration**: isi **Site URL** dengan domainmu (misalnya `https://biopay.com`). Tambahkan juga URL Vercel (`https://nama-proyek.vercel.app`) di **Redirect URLs**.
5. **Project Settings → API**: catat **Project URL** dan **anon public key** untuk langkah 2.

## 2. Vercel (hosting + API)

1. Daftar di vercel.com dengan akun GitHub, lalu **Add New → Project** dan pilih repo `biopay`.
2. Framework: **Other**. Build command: kosong. Output directory: kosong (root).
3. **Environment Variables** (lihat `.env.example`):
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` dari langkah 1.
   - `SENTRY_DSN` dari langkah 5 (boleh menyusul).
   - `RESEND_API_KEY` dan `RECEIPT_FROM` dari langkah 4 (boleh menyusul).
4. **Deploy**. Buka `https://nama-proyek.vercel.app/api/health`; harus muncul `"ok":true`.
5. **Settings → Git**: pilih branch produksi. Saat ini kode terbaru ada di branch `claude/sleepy-lovelace-9tp4n5`; idealnya digabung ke `main` lewat pull request, lalu `main` dijadikan branch produksi.

## 3. Domain: Namecheap + Cloudflare DNS

1. Beli domain di namecheap.com (misalnya `.com`, `.app`, `.co`). Domain `.id` biasanya dibeli lewat registrar lokal Indonesia dan mensyaratkan KTP.
2. Daftar di cloudflare.com, **Add a site**, masukkan domain, lalu pilih paket **Free**. Cloudflare memberi **2 nameserver**.
3. Di Namecheap: **Domain List → Manage → Nameservers → Custom DNS**, isi 2 nameserver dari Cloudflare. Perubahan bisa butuh beberapa jam.
4. Di Vercel: **Settings → Domains → Add**, masukkan domainmu. Vercel menampilkan record DNS yang harus dibuat (biasanya `A` untuk domain utama dan `CNAME` untuk `www`).
5. Di Cloudflare **DNS**: buat record persis seperti yang diminta Vercel, dengan proxy **DNS only** (awan abu-abu) supaya sertifikat HTTPS Vercel bekerja.
6. Tunggu sampai Vercel menulis **Valid Configuration**.

## 4. Resend (email struk & verifikasi)

1. Daftar di resend.com, **Domains → Add Domain**. Pakai subdomain, misalnya `mail.biopay.com`.
2. Resend menampilkan record DNS (SPF, DKIM, dan disarankan DMARC). Buat semuanya di **Cloudflare DNS**, lalu klik **Verify** di Resend.
3. **API Keys → Create** dengan izin *Sending access*. Isi ke Vercel sebagai `RESEND_API_KEY`, dan isi `RECEIPT_FROM` misalnya `BioPay <struk@mail.biopay.com>`.
4. Supaya email verifikasi Supabase juga lewat domainmu: di Supabase **Authentication → SMTP Settings**, isi host `smtp.resend.com`, port `465`, username `resend`, password = API key Resend, dan pengirim = alamat di domainmu.
5. Redeploy di Vercel. Setelah pengguna yang login membayar, struk otomatis terkirim ke email mereka sendiri (hanya ke email pemilik akun).

## 5. Sentry (pelacakan error)

1. Daftar di sentry.io, **Create Project → Browser JavaScript**.
2. Salin **DSN**, isi ke Vercel sebagai `SENTRY_DSN`, lalu redeploy.
3. Aplikasi tidak mengirim email pengguna ke Sentry (`sendDefaultPii: false`).

## 6. UptimeRobot (pemantauan)

1. Daftar di uptimerobot.com, **Add New Monitor**:
   - Type **Keyword**, URL `https://domainmu/api/health`, keyword `"ok":true`, interval 5 menit.
   - Tambah satu monitor **HTTP(s)** untuk `https://domainmu/`.
2. Atur kontak peringatan ke email atau aplikasi HP-mu. `/api/health` juga mengecek apakah Supabase hidup; kalau mati, statusnya 503 dan kamu langsung diberi tahu.

## 7. Yang sengaja belum dipasang, dan alasannya

- **Clerk:** login sudah ditangani **Supabase Auth**, dan memakai keduanya berarti dua sistem login yang harus disinkronkan. Kalau nanti butuh fitur khusus Clerk, Supabase mendukung Clerk sebagai *third-party auth*.
- **Pinecone:** memori asisten sudah disiapkan di Supabase (`assistant_memory`, pgvector, fungsi `match_assistant_memory`). Pinecone baru masuk akal kalau datanya jutaan vektor.
- **Stripe:** setahu kami Stripe belum menerima bisnis yang terdaftar di Indonesia; cek daftar negara di situs Stripe. Untuk Indonesia, pakai **Xendit** atau **Midtrans** (QRIS, VA, e-wallet). Uang sungguhan juga wajib lewat mitra berizin Bank Indonesia. Stripe bisa dipakai nanti kalau punya badan usaha di AS atau Singapura, misalnya untuk menagih biaya langganan merchant.

## 8. Home server + Claude Code

Bagian ini dikerjakan di komputermu sendiri, karena sesi Claude Code di cloud tidak bisa menjangkau komputermu:
1. Pasang aplikasi **Claude Desktop**, atau Claude Code di terminal.
2. Di folder proyek BioPay, jalankan `claude remote-control`. Sesinya akan muncul di aplikasi Claude Code, sehingga kamu bisa mengerjakan BioPay di komputer itu dari HP.
3. Jangan membuka port komputer ke internet. Kalau server rumah perlu diakses dari luar, gunakan **Cloudflare Tunnel**.

## Urutan & perkiraan waktu

1. Supabase (15 menit), lalu Vercel (10 menit). Setelah ini aplikasi sudah **terhubung** di URL Vercel.
2. Domain + Cloudflare (30 menit + menunggu propagasi DNS).
3. Resend (20 menit), Sentry (5 menit), UptimeRobot (5 menit).

## Untuk developer

- `npm test`: tes API, aplikasi (mode demo), dan lapisan cloud (Supabase disimulasikan).
- `DATABASE_URL=postgres://... npm run test:db`: menguji migrasi dan aturan keamanan di Postgres sungguhan (butuh pgvector).
- Kedua tes juga jalan otomatis di GitHub Actions setiap push.
