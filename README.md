# BioPay

**Pay with your face and palm. No card, no phone.**

BioPay is a two-factor biometric checkout for Southeast Asia. A shopper looks at a terminal, shows a palm, and the payment settles from the e-wallet or bank account they already use. Merchants can charge customers from their own phone, and consumer apps (for example travel booking) can add face-and-palm checkout.

This repository is an interactive prototype that runs entirely in the browser, as a single `index.html`.

> The repository also contains **Cek Sehat Mandiri**, a separate health self-check PWA, in [`cek-sehat/`](cek-sehat/README.md).

**Live demo:** https://ikbal66123.github.io/biopay/ (open in Chrome, Edge or Safari and allow camera access)

---

## What to try (about 1 minute each)

| | Who | Flow |
|---|---|---|
| **POV 1** | Shopper at a store | BioPay terminal: face scan, then palm scan, then a receipt. Foreign merchants trigger automatic FX conversion and a tourist VAT-refund receipt. After payment, the dashboard shows wallets, history, a Bio-Pass travel credential, and family sharing with daily limits. |
| **POV 2** | Merchant | *Kasku* e-wallet (fictional): tap **BioPay → Tagih Pelanggan**, enter an amount, scan the customer's face and palm, and the money lands in the merchant's balance. Also: QRIS, top up, transfer, bill payments. |
| **POV 3** | Traveler | *Lintas* travel app (fictional): search flights, hotels, trains or attractions, fill in passenger details and add-ons, apply a promo code, then pay with **BioPay** (face + palm), the in-app balance, or a virtual account. You get an e-ticket with a booking code; orders can be cancelled with a refund. The same three BioPay merchant features as POV 2 are built in. |

**Accounts:** on the terminal's start screen, **Daftar BioID** creates an account in four steps: details (nationality, ID document type and number validated per country, e.g. 16-digit NIK for an Indonesian KTP; mobile number with a country-code picker, stored in E.164 format; explicit biometric consent), a photo of the ID document (camera capture inside a card frame, or upload; resized before storage and checked on-device for a face photo), face enrollment and palm enrollment. It then issues a BioID; **Masuk** signs in with email or phone plus password, or with your face. The dashboard, Bio-Pass and its passport MRZ line follow the signed-in account, and **Pengaturan** has sign-out and *delete account & biometric data*. Demo account: `ikbal@biopay.id` / `biopay123`.

**Language:** the terminal's start screen has an Indonesian / English / Japanese switch that translates the BioPay app (start, sign-up, sign-in, payment flow and dashboard); each BioPay instance keeps its own language.

The landing section at the top of the page has **Try it** buttons that jump straight into each flow. The apps' interface is in Bahasa Indonesia, the launch market. The landing section switches between English and Indonesian.

## What is real and what is simulated

| Real | Simulated |
|---|---|
| Live camera feed on every scan screen | Identity matching: every face resolves to the demo user |
| On-device detection that a face or a hand is actually in front of the camera ([MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector)); the scan only passes once it is seen steadily for about 1.5 s | 3D liveness depth sensing and palm-vein reading |
| All UI flows, validation, state, and calculations (FX, VAT, promos, refunds) | Balances, payments, settlement, bookings |
| Sign-up and sign-in with validation; passwords stored as salted SHA-256 hashes | Account storage: `localStorage` in this browser instead of a server |

No image or biometric data leaves the device. If the camera is blocked, or the detection model cannot load, scans fall back to a clearly labelled simulation mode so the demo never gets stuck.

Kasku and Lintas are fictional brands. DANA, GoPay, BCA, Agoda and other names appear only to illustrate integrations; there is no affiliation.

## Run it locally

Open `index.html` directly in Chrome or Edge, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000. Browsers only allow camera access on `https://`, `localhost` or local files. An internet connection is needed for Tailwind CSS, fonts, icons and the detection models (all loaded from CDNs).

## How it is built

A single HTML file with plain JavaScript, Tailwind CSS (CDN), Phosphor icons and IBM Plex type. The main pieces:

- **`createBioPay(suffix, pov, ns)`**: the whole BioPay terminal app as a factory. It runs three times: on the POV 1 terminal and inside the POV 2 and POV 3 apps. The copies are generated from the POV 1 markup at load time (IDs get a suffix and handlers point at the right instance), so all three always look and behave the same.
- **`createMerchantKit(...)`**: the merchant features (charge a customer, show QRIS, open BioPay), shared by POV 2 and POV 3 in the same way.
- **`TV`**: the Lintas travel app (search, results, checkout, payment, e-tickets, orders, account).
- **`requestCameraAccess` / `scanBiometric`**: one shared camera stream per facing mode (permission asked once, camera released 6 s after the last scan) and MediaPipe face / hand detection with an overlay and a demo-mode fallback.

## Roadmap after the prototype

1. 1:N face identification against enrolled BioIDs, with certified presentation-attack detection.
2. Palm-vein capture on dedicated terminal hardware (near-infrared), with palm-print as the phone fallback.
3. Wallet and bank integrations through the providers' merchant APIs, and QRIS interoperability.
4. Consent, enrollment and data-protection flows that comply with Indonesia's personal data protection law (UU PDP).

---

### Ringkasan (Bahasa Indonesia)

BioPay adalah prototipe pembayaran biometrik dua faktor (wajah + telapak tangan). Buka `index.html` di Chrome/Edge atau lewat GitHub Pages, izinkan kamera, lalu coba tiga alur: terminal toko (POV 1), e-wallet merchant Kasku (POV 2), dan aplikasi travel Lintas (POV 3). Kamera dan deteksi wajah/tangan berjalan sungguhan di perangkat; identitas, saldo, dan pembayaran masih simulasi.
