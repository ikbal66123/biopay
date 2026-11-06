"""Manifest JSON sebagai catatan bukti kepemilikan (sidecar file).

Berisi hash SHA-256 file asli & file terlindungi, waktu, pengaturan, dan tag
pemilik (hash, bukan ID asli). Simpan file asli + manifest di tempat aman:
jika suatu saat ada deepfake, kamu bisa menunjukkan file asli yang hash-nya
cocok dan tanggal pembuatannya.

Catatan: ini belum ditandatangani secara kriptografis. Untuk bukti yang bisa
diverifikasi pihak lain, tahap berikutnya adalah C2PA (c2patool / c2pa-python)
dengan sertifikat penandatangan.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from . import __version__
from .watermark import owner_tag


def sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_manifest(path: str | Path, original: str | Path, protected: str | Path, owner: str, extra: dict) -> dict:
    data = {
        "tool": "antideepfake",
        "version": __version__,
        "created_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "owner_tag_hex": owner_tag(owner).hex(),
        "original": {"file": Path(original).name, "sha256": sha256_file(original)},
        "protected": {"file": Path(protected).name, "sha256": sha256_file(protected)},
        **extra,
    }
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False, default=str))
    return data
