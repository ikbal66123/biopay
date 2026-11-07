# BioPay: YC application draft

> **Catatan untuk Ikbal (hapus sebelum dikirim).**
> Ini draf jawaban dalam bahasa Inggris berdasarkan pertanyaan yang umum ada di formulir Y Combinator. Pertanyaan di formulir bisa berubah, jadi cocokkan dengan formulir yang sedang berlaku di apply.ycombinator.com.
> Semua bagian bertanda **[TODO]** harus kamu isi sendiri: data pendiri, traksi, angka pasar beserta sumbernya. Jangan mengarang angka; reviewer YC sangat menghargai jawaban yang jujur dan spesifik.
> Jawaban yang bertanda *(hypothesis)* adalah dugaan yang wajar untuk tahap ide, dan memang harus ditulis sebagai dugaan.

---

## Company

**Company name:** BioPay

**Describe what your company does in 50 characters or less.**
Face + palm checkout that pays from any e-wallet.

**Company URL / demo:** https://ikbal66123.github.io/biopay/ · Source: https://github.com/ikbal66123/biopay

**What is your company going to make?**
BioPay lets people pay in stores without a card or a phone. At checkout, the shopper looks at a BioPay terminal and shows their palm. The face identifies who they are, the palm confirms it, and the payment is taken from the e-wallet or bank account they linked when they enrolled. Two factors mean a face alone can never move money.

The same rails work in three places, which our prototype demonstrates:
1. **Store terminals** for retailers, including tourists paying in rupiah with automatic FX and a VAT-refund receipt.
2. **Merchant phones**: a small seller charges a customer by scanning the customer's face and palm with their own phone, with no terminal hardware.
3. **Apps**: consumer apps, like a travel booking app, add "pay with BioPay" at checkout.

We start in Indonesia, where people already pay with many different e-wallets and QR codes, and expand across Southeast Asia.

## Founders

**[TODO]** For each founder: name, role, what they have built before, and why they are the right person for this. Include LinkedIn / GitHub. YC weighs this section heavily.

**Who writes code, or does other technical work on your product?**
**[TODO]** For example: "I (Ikbal) built the entire prototype myself: [describe]." If you used AI tools to build it, say so honestly and explain what you understand and can change yourself.

**How long have the founders known one another and how did you meet?** **[TODO]**

## Progress

**How far along are you?**
We have a working browser prototype covering the three flows above. It uses the device's real camera and runs on-device face and hand detection (MediaPipe), so a scan only passes when a face or palm is actually in front of the camera. Identity matching, palm-vein reading and money movement are simulated today.
**[TODO]** Add anything real: merchant conversations, letters of intent, pilots, waitlist sign-ups, hardware tests.

**How many active users or customers do you have?** **[TODO]** (If none yet, say "None yet; prototype stage" and describe the next concrete step, for example "pilot with N merchants in [city] starting [month].")

**Do you have revenue?** **[TODO]**

**If you are applying with the same idea as a previous batch, did anything change?** **[TODO / not applicable]**

## Idea

**Why did you pick this idea to work on? Do you have domain expertise?**
**[TODO]** The strongest answer is personal: what you saw or experienced. A possible starting point to rewrite in your own words: *at Indonesian checkouts, people switch between several wallet apps and QR codes, phones run out of battery or signal, and tourists pay extra for FX and cards. We want paying to be as simple as being there.*

**Who are your competitors? What do you understand that they don't?**
Biometric payments already work at scale in some places, which is evidence the behavior is acceptable to consumers:
- **Alipay "Smile to Pay"** (face payment) in China.
- **Amazon One** (palm payment) in Amazon and Whole Foods stores in the US.
- **PopID** (face pay) in US restaurants and venues.
- **Mastercard's Biometric Checkout Program**, a card-network framework for face and palm payments.

None of these is built around Southeast Asia's reality, where the default payment is an e-wallet or QRIS rather than a card, and where small merchants matter more than big chains. Our bets *(hypothesis)*:
1. **Wallet-agnostic:** BioPay sits on top of the wallets people already have instead of competing with them.
2. **Two factors by default:** face plus palm, which addresses the main fear about face payment (being charged without consent).
3. **No-hardware option:** merchants can start with a phone, then upgrade to a terminal.
**[TODO]** Add local competitors you know of in Indonesia and Southeast Asia.

**How do or will you make money? How much could you make?**
*(hypothesis)* A per-transaction fee paid by the merchant, priced below card and comparable to QR acceptance fees, plus a monthly fee for terminal hardware. Later: tourism partners (VAT refund processing, FX margin) and apps that embed BioPay checkout.
**[TODO]** Market size with sources, for example the number of e-wallet users, merchants accepting QRIS, and international tourist arrivals in Indonesia. Use official sources (Bank Indonesia, BPS, Kemenparekraf) and cite them.

**What's the biggest risk, and how will you handle it?**
Trust and regulation around biometric data. Our plan: templates encrypted and stored with consent; a face alone can never authorize a payment; compliance with Indonesia's Personal Data Protection Law (UU PDP, Law No. 27/2022); and working with licensed payment partners instead of holding funds ourselves.

## Equity, legal, other

**[TODO]** Incorporation status, country, equity split, investment taken so far, and the rest of the legal questions on the form.

---

## One-minute demo video script

YC asks for a short founder video, and a demo video helps too. Record your screen with your face in the corner. Use the live GitHub Pages link so the real camera works.

| Time | Show | Say (example; use your own words) |
|---|---|---|
| 0:00 to 0:08 | The landing page | "This is BioPay. You pay with your face and your palm. No card, no phone." |
| 0:08 to 0:25 | POV 1: tap "Scan my face now", the face is boxed, then the palm, then the receipt from a foreign merchant | "The face finds who you are, the palm confirms it. It's paid from the wallet you already use, and tourists get FX and a tax-refund receipt automatically." |
| 0:25 to 0:40 | POV 2 Kasku: Tagih Pelanggan, amount, scan face and palm, money arrives | "A small merchant doesn't need a terminal. They charge a customer with their own phone." |
| 0:40 to 0:52 | POV 3 Lintas: pick a flight, pay with BioPay, e-ticket | "And any app can add BioPay at checkout, like this travel app." |
| 0:52 to 1:00 | Back to the landing page | "We're starting in Indonesia. Today the camera and detection are real, and identity and payments are simulated. Next: [your concrete next step]." |

Tips: record in good light, keep the hand flat and open for the palm step, and practice once so the whole flow fits in a minute.

## Submission checklist

- [ ] GitHub Pages is live and the link opens on a phone with the camera working.
- [ ] Every **[TODO]** above is filled in or removed, with numbers that have sources.
- [ ] The founder video is recorded (YC's own founder video is separate from the demo).
- [ ] Someone who has never seen BioPay can complete all three flows without help.
