#!/usr/bin/env python3
"""Buat versi white-label (tanpa merek TAO) dari tao-group-os.html.

    python3 tools/make_whitelabel.py

Menulis maison-os.html. Ubah BRAND dan VENUES di bawah untuk klien lain, lalu jalankan
ulang setiap kali tao-group-os.html berubah. Skrip gagal kalau masih ada teks bermerek
TAO atau nama venue TAO yang terlihat oleh pengguna, jadi hasilnya aman untuk didemokan.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "tao-group-os.html"
OUT = ROOT / "maison-os.html"

BRAND = {
    "name": "Maison",            # nama merek di teks
    "upper": "MAISON",           # wordmark huruf besar
    "group": "Maison Group",     # nama perusahaan
    "monogram": "M",             # kotak logo di header
    "currency": "M-Gold",        # mata uang loyalitas (pengganti T-Gold)
}

# Venue demo (fiktif). Format sama dengan TAO_VENUES:
# [nama, merek, kategori, kota, negara, area, lat, lng, zona waktu, tamu, okupansi, segera dibuka?]
VENUES = """        // Venue demo fiktif untuk versi white-label. Ganti dengan daftar venue klien.
        // [nama, merek, kategori, kota, negara, area, lat, lng, zona waktu, tamu, okupansi, segera dibuka?]
        const TAO_VENUES = [
            ["Maison Nightclub", "Maison", "Klub Malam", "Jakarta", "Indonesia", "SCBD", -6.2253, 106.8090, "Asia/Jakarta", "1,450", "93%"],
            ["Aurum Dining", "Aurum", "Restoran", "Jakarta", "Indonesia", "Senopati", -6.2318, 106.8075, "Asia/Jakarta", "320", "86%"],
            ["Velour Lounge", "Velour", "Lounge & Bar", "Jakarta", "Indonesia", "Kemang", -6.2610, 106.8130, "Asia/Jakarta", "280", "81%"],
            ["Noir Rooftop", "Noir", "Lounge & Bar", "Jakarta", "Indonesia", "Thamrin", -6.1930, 106.8230, "Asia/Jakarta", "350", "88%"],
            ["Solstice Beach Club", "Solstice", "Klub Siang", "Bali", "Indonesia", "Seminyak", -8.6910, 115.1560, "Asia/Makassar", "1,900", "91%"],
            ["Maison Bali", "Maison", "Klub Malam", "Bali", "Indonesia", "Canggu", -8.6480, 115.1385, "Asia/Makassar", "1,100", "89%"],
            ["Aurum Uluwatu", "Aurum", "Restoran", "Bali", "Indonesia", "Uluwatu", -8.8150, 115.0880, "Asia/Makassar", "240", "84%"],
            ["Velour Surabaya", "Velour", "Lounge & Bar", "Surabaya", "Indonesia", "Darmo", -7.2890, 112.7350, "Asia/Jakarta", "260", "78%"],
            ["Maison Singapore", "Maison", "Klub Malam", "Singapura", "Singapura", "Clarke Quay", 1.2906, 103.8465, "Asia/Singapore", "1,300", "94%"],
            ["Aurum Singapore", "Aurum", "Restoran", "Singapura", "Singapura", "Marina", 1.2790, 103.8540, "Asia/Singapore", "300", "87%"],
            ["Maison Bangkok", "Maison", "Klub Malam", "Bangkok", "Thailand", "Sukhumvit", 13.7440, 100.5490, "Asia/Bangkok", "1,250", "92%"],
            ["Noir Bangkok", "Noir", "Lounge & Bar", "Bangkok", "Thailand", "Thonglor", 13.7380, 100.5600, "Asia/Bangkok", "330", "85%"],
            ["Velour Kuala Lumpur", "Velour", "Lounge & Bar", "Kuala Lumpur", "Malaysia", "Bukit Bintang", 3.1466, 101.7110, "Asia/Kuala_Lumpur", "290", "82%"],
            ["Solstice Dubai", "Solstice", "Klub Siang", "Dubai", "Uni Emirat Arab", "JBR", 25.0780, 55.1340, "Asia/Dubai", "1,600", "90%"],
            ["Maison Dubai", "Maison", "Klub Malam", "Dubai", "Uni Emirat Arab", "DIFC", 25.2110, 55.2810, "Asia/Dubai", "1,200", "95%"],
            ["Maison Tokyo", "Maison", "Klub Malam", "Tokyo", "Jepang", "Roppongi", 35.6620, 139.7300, "Asia/Tokyo", "0", "0%", true]
        ];"""

# Urutan penting: frasa panjang lebih dulu.
REPLACEMENTS = [
    ("Daftar dari sumber publik TAO Group, November 2026.", "Data venue adalah contoh untuk demo."),
    ("Sumber publik TAO Group", "Data demo"),
    ("TAO Group Global Hospitality OS - Edisi Mewah", f"{BRAND['name']} OS - Edisi Mewah"),
    ("TAO GROUP OS", f"{BRAND['upper']} OS"),
    ("TAO Group OS", f"{BRAND['name']} OS"),
    ("TAO Group Hospitality", BRAND["group"]),
    ("TAO Group", BRAND["group"]),
    ("Grup Tao", f"Grup {BRAND['name']}"),
    ("TAO Concierge", f"{BRAND['name']} Concierge"),
    ("Malam ini di TAO.", f"Malam ini di {BRAND['name']}."),
    ("Malam saya di TAO", f"Malam saya di {BRAND['name']}"),
    ("Cabang TAO", f"Cabang {BRAND['name']}"),
    ("cabang TAO", f"cabang {BRAND['name']}"),
    ("kota TAO", f"kota {BRAND['name']}"),
    ("venue TAO", f"venue {BRAND['name']}"),
    ("member TAO", f"member {BRAND['name']}"),
    ("#TAOGroup", "#" + BRAND["group"].replace(" ", "")),
    ("T-Gold", BRAND["currency"]),
    ("T&#8209;Gold", BRAND["currency"].replace("-", "&#8209;")),
    ("T‑Gold", BRAND["currency"].replace("-", "‑")),
    ("TAO Espresso Martini", "House Espresso Martini"),
    # Event & default venue yang menyebut venue TAO
    ("OMNIA Las Vegas", "Maison Dubai"),
    ("Marquee Nightclub, Las Vegas", "Maison Nightclub, Jakarta"),
    ("TAO Beach Dayclub, Las Vegas", "Solstice Beach Club, Bali"),
    ("Hakkasan Nightclub, Las Vegas", "Maison Bangkok"),
    ("OMNIA Nightclub, Las Vegas", "Maison Singapore"),
    ("Calvin Harris", "Midnight Sessions"),
    ("Halloween: Tiësto", "Halloween Masquerade"),
    ("'TAO Nightclub'", "'Maison Nightclub'"),
    (" TAO Nightclub</p>", " Maison Bali</p>"),
    ("(misal: Las Vegas, Tokyo)", "(misal: Jakarta, Bali)"),
    ("privat untuk 2 orang di TAO Asian Bistro.", "privat untuk 2 orang di Aurum Dining."),
    ("TAO Signature Cocktail Round", "House Signature Cocktail Round"),
    ("location: 'TAO Asian Bistro'", "location: 'Aurum Dining'"),
    ("location: 'OMNIA Nightclub'", "location: 'Maison Singapore'"),
    ('value="MGM Grand Hotel"', 'value="Grand Hotel"'),
    ("Aku di Marquee jam 11", f"Aku di {BRAND['name']} jam 11"),
    ("TAO Private Member", f"{BRAND['upper']} Private Member"),
    ("currentOutletData.name : 'TAO'", f"currentOutletData.name : '{BRAND['name']}'"),
    ("misalnya “Hakkasan”", "misalnya “Aurum”"),
    ("<!-- ===== TAO OS:", f"<!-- ===== {BRAND['name']} OS:"),
    ("(untuk tim operasional TAO)", "(untuk tim operasional venue)"),
    ("<!-- ===== Signature TAO:", "<!-- ===== Signature:"),
    ("dari Las Vegas dan New York sampai Singapura, Dubai, dan London", "dari Jakarta dan Bali sampai Singapura, Bangkok, dan Dubai"),
]

# Teks bermerek yang tidak boleh tersisa di versi white-label (nama venue & lokasi khas TAO).
FORBIDDEN = r"\bTAO\b|\bTao\b|T-Gold|Hakkasan|OMNIA|Marquee|LAVO|Beauty & Essex|Yauatcha|Ling Ling|KOMA|Cathédrale|Sake No Hana|JEWEL|Highlight Room|Casadonna|Crane Club|Magic Hour|Peak with|Venetian|Caesars|Cosmopolitan|MGM Grand|\bARIA\b|Palazzo|Mohegan|Fontainebleau|Marina Bay Sands|Atlantis|Emirates Palace|St\. Regis|Mohari"
# Baris kode yang boleh menyebut nama tersebut (logika pemetaan gambar, tidak terlihat pengguna).
ALLOWED_LINE = re.compile(r'name\.includes\("|brandImageMapping\[|brandImageMapping\.TAO|"(TAO|HAKKASAN|OMNIA|MARQUEE|LAVO|BEAUTY)":')


def main():
    s = SRC.read_text(encoding="utf-8")

    a = s.index("        // Cabang TAO Group Hospitality")
    b = s.index("        const TAO_VENUES = [", a)
    end = s.index("        ];", b) + len("        ];")
    s = s[:a] + VENUES + s[end:]

    for old, new in REPLACEMENTS:
        s = s.replace(old, new)

    # Monogram: kotak logo header, intro, kartu member, rekap
    s = s.replace('font-display font-black text-sm shadow-lg glow-gold">TAO</div>', f'font-display font-black text-sm shadow-lg glow-gold">{BRAND["monogram"]}</div>')
    s = s.replace('<div class="mono lux-gold-text">TAO</div>', f'<div class="mono lux-gold-text">{BRAND["upper"]}</div>')
    s = s.replace('tracking-[0.3em] lux-gold-text">TAO</span>', f'tracking-[0.3em] lux-gold-text">{BRAND["upper"]}</span>')
    s = s.replace('tracking-[0.3em] lux-gold-text mt-5">TAO</p>', f'tracking-[0.3em] lux-gold-text mt-5">{BRAND["upper"]}</p>')
    s = s.replace("TAO-MEMBER-", BRAND["upper"] + "-MEMBER-").replace("'TAO-' +", f"'{BRAND['upper']}-' +").replace("data=TAO-", f"data={BRAND['upper']}-")
    s = s.replace("runCelebration(showDraft.pkg>0 ? showDraft.msg : 'TAO')", f"runCelebration(showDraft.pkg>0 ? showDraft.msg : '{BRAND['upper']}')")
    s = s.replace("runCelebration(showDraft.pkg > 0 ? msg : 'TAO')", f"runCelebration(showDraft.pkg > 0 ? msg : '{BRAND['upper']}')")
    s = s.replace("msg = (showDraft.msg || '').trim().slice(0, 24) || 'TAO'", f"msg = (showDraft.msg || '').trim().slice(0, 24) || '{BRAND['upper']}'")
    # Wordmark intro lebih panjang dari 3 huruf: kecilkan sedikit
    s = s.replace("</head>", "    <style>#luxIntro .mono { font-size: clamp(44px, 10.5vw, 110px); }</style>\n</head>", 1)

    leftovers = []
    for n, line in enumerate(s.splitlines(), 1):
        if ALLOWED_LINE.search(line):
            continue
        for m in re.finditer(FORBIDDEN, line):
            ctx = line[max(0, m.start() - 50): m.end() + 40].strip()
            if re.search(r"TAO_VENUES|taoOutletsData|TAO_STORE|tao-", ctx[max(0, ctx.find(m.group(0)) - 6): ctx.find(m.group(0)) + len(m.group(0)) + 8]):
                continue  # nama variabel internal
            leftovers.append(f"{n}: {m.group(0)!r} … {ctx}")
    if leftovers:
        print("Masih ada teks bermerek TAO di versi white-label:\n" + "\n".join(leftovers[:60]), file=sys.stderr)
        sys.exit(1)

    OUT.write_text(s, encoding="utf-8")
    print(f"Ditulis: {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
