"""Deteksi wajah sederhana (OpenCV Haar cascade) dan pembuatan mask wajah.

Haar cascade dipilih karena sudah ikut di paket opencv (tanpa unduhan model).
Akurasinya terbatas (wajah miring/samping sering terlewat). Untuk tahap video
sebaiknya diganti detektor yang lebih kuat (RetinaFace / MediaPipe / YuNet).
"""

from __future__ import annotations

import numpy as np


def detect_faces(image: np.ndarray, min_size: int = 40) -> list[tuple[int, int, int, int]]:
    """Kembalikan daftar kotak wajah (x, y, w, h) pada gambar RGB uint8."""
    import cv2

    if not hasattr(cv2, "CascadeClassifier"):
        raise ImportError("OpenCV versi ini tidak punya Haar cascade. Pasang: pip install 'opencv-python-headless<5'")
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    boxes = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(min_size, min_size))
    return [tuple(int(v) for v in b) for b in boxes]


def face_mask(
    shape: tuple[int, int],
    boxes: list[tuple[int, int, int, int]],
    margin: float = 0.35,
    feather: float = 0.15,
) -> np.ndarray:
    """Mask float32 (H, W) bernilai 1 di area wajah (+margin), 0 di luar, tepi dihaluskan.

    Margin ikut menutupi rambut, telinga, dan dagu, karena face-swap modern juga
    memakai area di sekitar wajah.
    """
    import cv2

    h, w = shape
    mask = np.zeros((h, w), dtype=np.float32)
    for x, y, bw, bh in boxes:
        mx, my = int(bw * margin), int(bh * margin)
        x0, y0 = max(0, x - mx), max(0, y - my)
        x1, y1 = min(w, x + bw + mx), min(h, y + bh + my)
        mask[y0:y1, x0:x1] = 1.0
    if feather > 0 and boxes:
        k = int(max(3, feather * max(b[2] for b in boxes))) | 1
        mask = cv2.GaussianBlur(mask, (k, k), 0)
        mask = np.clip(mask * 1.5, 0.0, 1.0)  # inti tetap 1, hanya tepi yang menurun
    return mask
