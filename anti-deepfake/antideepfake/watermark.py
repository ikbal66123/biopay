"""Watermark tak terlihat sebagai penanda kepemilikan.

Metode: QIM (Quantization Index Modulation) pada koefisien DCT frekuensi menengah
di blok 8x8 kanal luminans. Setiap bit payload diulang di puluhan sampai ribuan
slot yang disebar secara acak (berkunci), lalu dibaca dengan voting mayoritas.

Payload 64 bit:
  - 3 byte "ADF" (penanda aplikasi ini)
  - 5 byte pertama SHA-256 dari ID pemilik (ID asli tidak disimpan di gambar)

Catatan: pustaka `invisible-watermark` (DWT-DCT) sempat dicoba, tapi pada uji
ia mengubah piksel sampai ±80..255 karena overflow (PSNR ~31 dB), jauh lebih
terlihat dibanding perlindungan adversarial-nya sendiri. Jadi kita pakai
implementasi kecil ini (perubahan maks ~±3/255, PSNR > 40 dB).

PENTING: watermark ini *bukan* tanda tangan kriptografis. Tahan terhadap JPEG
kualitas tinggi-sedang, tapi hilang karena crop yang menggeser grid 8x8,
resize, rotasi, atau sengaja dihapus. Untuk bukti yang kuat gunakan juga
manifest (manifest.py) dan, di tahap berikutnya, C2PA (Content Credentials).
"""

from __future__ import annotations

import hashlib

import numpy as np

MAGIC = b"ADF"
PAYLOAD_BYTES = 8
N_BITS = PAYLOAD_BYTES * 8
MIN_SIDE = 128
STEP = 12.0                      # langkah kuantisasi QIM (makin besar = makin kuat, makin terlihat)
COEFS = ((1, 2), (2, 1), (2, 2))  # koefisien DCT frekuensi menengah per blok 8x8
KEY = 0xADF0                     # kunci acak penyebaran bit


def owner_tag(owner: str) -> bytes:
    return hashlib.sha256(owner.encode("utf-8")).digest()[: PAYLOAD_BYTES - len(MAGIC)]


def _dct_matrix(n: int = 8) -> np.ndarray:
    k = np.arange(n)[:, None]
    i = np.arange(n)[None, :]
    d = np.cos(np.pi * (2 * i + 1) * k / (2 * n)) * np.sqrt(2 / n)
    d[0] /= np.sqrt(2)
    return d


_D = _dct_matrix()


def _luma(rgb: np.ndarray) -> np.ndarray:
    return rgb.astype(np.float64) @ np.array([0.299, 0.587, 0.114])


def _blocks(y: np.ndarray) -> np.ndarray:
    h, w = (y.shape[0] // 8) * 8, (y.shape[1] // 8) * 8
    b = y[:h, :w].reshape(h // 8, 8, w // 8, 8).transpose(0, 2, 1, 3)
    return b  # (nby, nbx, 8, 8)


def _slot_bits(n_slots: int) -> np.ndarray:
    """Indeks bit untuk tiap slot: tiap bit mendapat jumlah slot yang sama, urutan diacak."""
    idx = np.arange(n_slots) % N_BITS
    np.random.default_rng(KEY).shuffle(idx)
    return idx


def _bits(payload: bytes) -> np.ndarray:
    return np.unpackbits(np.frombuffer(payload, dtype=np.uint8)).astype(np.int64)


def embed_watermark(image: np.ndarray, owner: str) -> np.ndarray:
    """Sisipkan watermark ke gambar RGB uint8. Gambar < 128 px dikembalikan apa adanya."""
    if min(image.shape[:2]) < MIN_SIDE:
        return image
    y = _luma(image)
    blocks = _blocks(y)
    coef = _D @ blocks @ _D.T  # DCT 2D tiap blok
    slots = np.stack([coef[..., u, v] for u, v in COEFS], -1)  # (nby, nbx, k)
    flat = slots.reshape(-1)
    bits = _bits(MAGIC + owner_tag(owner))[_slot_bits(flat.size)]
    # QIM: bit 0 -> kelipatan STEP, bit 1 -> kelipatan STEP digeser STEP/2
    offset = bits * (STEP / 2)
    q = np.round((flat - offset) / STEP) * STEP + offset
    dslots = (q - flat).reshape(slots.shape)

    dcoef = np.zeros_like(coef)
    for i, (u, v) in enumerate(COEFS):
        dcoef[..., u, v] = dslots[..., i]
    dblocks = _D.T @ dcoef @ _D  # IDCT
    nby, nbx = dblocks.shape[:2]
    dy = np.zeros_like(y)
    dy[: nby * 8, : nbx * 8] = dblocks.transpose(0, 2, 1, 3).reshape(nby * 8, nbx * 8)
    # Menambah dY yang sama ke R, G, B mengubah luminans tepat sebesar dY.
    out = image.astype(np.float64) + dy[..., None]
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


def _read_bits(image: np.ndarray) -> tuple[np.ndarray, float]:
    coef = _D @ _blocks(_luma(image)) @ _D.T
    flat = np.stack([coef[..., u, v] for u, v in COEFS], -1).reshape(-1)
    # Jarak ke kisi bit-0 vs kisi bit-1 -> skor lunak di [-1, 1] (positif = bit 1)
    r = np.mod(flat, STEP) / STEP  # 0 atau 1 ~ bit 0, 0.5 ~ bit 1
    soft = 1 - 4 * np.abs(r - 0.5)  # +1 di 0.5, -1 di 0/1
    idx = _slot_bits(flat.size)
    votes = np.bincount(idx, weights=soft, minlength=N_BITS)
    counts = np.bincount(idx, minlength=N_BITS)
    mean = votes / np.maximum(counts, 1)
    return (mean > 0).astype(np.uint8), float(np.abs(mean).mean())


def detect_watermark(image: np.ndarray, owner: str | None = None) -> dict:
    """Baca watermark. Mengembalikan dict:
    found        -> penanda "ADF" terbaca utuh
    owner_match  -> tag cocok (>= 90% bit) dengan `owner` (None jika owner tidak diberikan)
    bit_accuracy -> persentase bit yang cocok dengan payload owner
    confidence   -> 0..1, kekuatan sinyal rata-rata (~0 = tidak ada watermark)
    """
    if min(image.shape[:2]) < MIN_SIDE:
        return {"found": False, "owner_match": None, "bit_accuracy": None, "reason": "gambar terlalu kecil"}
    bits, conf = _read_bits(image)
    raw = np.packbits(bits).tobytes()
    result = {
        "found": raw[: len(MAGIC)] == MAGIC,
        "owner_match": None,
        "bit_accuracy": None,
        "confidence": round(conf, 3),
        "tag_hex": raw.hex(),
    }
    if owner is not None:
        acc = float((bits == _bits(MAGIC + owner_tag(owner))).mean())
        result["bit_accuracy"] = acc
        # 64 bit acak cocok >= 90% secara kebetulan: peluang ~1e-11
        result["owner_match"] = acc >= 0.9
    return result
