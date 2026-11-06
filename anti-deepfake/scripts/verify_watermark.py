#!/usr/bin/env python3
"""Cek apakah sebuah foto berisi watermark aplikasi ini (dan milik siapa).

    python scripts/verify_watermark.py foto_dari_internet.jpg --owner namaku
    python scripts/verify_watermark.py foto.png --manifest fotoku_protected.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from antideepfake.imageio import load_rgb  # noqa: E402
from antideepfake.manifest import sha256_file  # noqa: E402
from antideepfake.watermark import detect_watermark  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image")
    ap.add_argument("--owner", help="ID pemilik yang dipakai saat melindungi")
    ap.add_argument("--manifest", help="manifest JSON untuk mencocokkan hash file")
    args = ap.parse_args()

    res = detect_watermark(load_rgb(args.image), args.owner)
    if args.manifest:
        man = json.loads(Path(args.manifest).read_text())
        digest = sha256_file(args.image)
        res["identical_to_protected_file"] = digest == man["protected"]["sha256"]
        res["identical_to_original_file"] = digest == man["original"]["sha256"]
        res["manifest_owner_tag"] = man.get("owner_tag_hex")
        res["tag_matches_manifest"] = res.get("tag_hex", "")[6:] == man.get("owner_tag_hex")
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
