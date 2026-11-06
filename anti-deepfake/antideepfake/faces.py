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


def _onnx_providers() -> tuple[list[str], int]:
    try:
        import onnxruntime as ort

        avail = ort.get_available_providers()
    except ImportError:
        return ["CPUExecutionProvider"], -1
    if "CUDAExecutionProvider" in avail:
        return ["CUDAExecutionProvider", "CPUExecutionProvider"], 0
    return ["CPUExecutionProvider"], -1


class FaceDetector:
    """Detektor wajah dengan beberapa backend.

    - "insightface": RetinaFace (SCRFD det_10g dari paket buffalo_l). Paling akurat,
      termasuk wajah miring/kecil. Butuh `pip install insightface onnxruntime(-gpu)`;
      model (~300 MB) diunduh otomatis ke ~/.insightface saat pertama dipakai.
    - "yunet": OpenCV YuNet, ringan. Butuh file model `face_detection_yunet_2023mar.onnx`
      (dari github.com/opencv/opencv_zoo), lewat argumen `yunet_model`.
    - "haar": Haar cascade bawaan OpenCV, tanpa unduhan, paling lemah.
    - "auto": insightface jika terpasang, selain itu haar.

    `detect(rgb)` -> list (x, y, w, h, skor, landmark) dalam koordinat gambar asli;
    landmark = array (5, 2) [mata kiri, mata kanan, hidung, mulut kiri, mulut kanan]
    untuk backend insightface/yunet, None untuk haar.
    Deteksi dilakukan pada versi gambar yang diperkecil (`detect_size`) agar cepat.
    """

    def __init__(self, backend: str = "auto", detect_size: int = 640, min_score: float = 0.5,
                 yunet_model: str | None = None) -> None:
        self.detect_size = detect_size
        self.min_score = min_score
        if backend == "auto":
            try:
                import insightface  # noqa: F401

                backend = "insightface"
            except ImportError:
                backend = "haar"
        self.backend = backend
        if backend == "insightface":
            from insightface.app import FaceAnalysis

            providers, ctx = _onnx_providers()
            self._app = FaceAnalysis(name="buffalo_l", allowed_modules=["detection"], providers=providers)
            self._app.prepare(ctx_id=ctx, det_size=(640, 640), det_thresh=min_score)
        elif backend == "yunet":
            import cv2

            if not yunet_model:
                raise ValueError("Backend yunet butuh path model (yunet_model).")
            self._yunet = cv2.FaceDetectorYN.create(yunet_model, "", (320, 320), score_threshold=min_score)
        elif backend != "haar":
            raise ValueError(f"Backend detektor tidak dikenal: {backend}")

    def detect(self, image: np.ndarray) -> list[tuple[float, float, float, float, float]]:
        import cv2

        h, w = image.shape[:2]
        s = min(1.0, self.detect_size / max(h, w))
        small = cv2.resize(image, (max(1, int(w * s)), max(1, int(h * s))), interpolation=cv2.INTER_AREA) if s < 1 else image
        if self.backend == "insightface":
            faces = self._app.get(np.ascontiguousarray(small[:, :, ::-1]))
            boxes = [(f.bbox[0], f.bbox[1], f.bbox[2] - f.bbox[0], f.bbox[3] - f.bbox[1], float(f.det_score),
                      f.kps.astype(np.float32)) for f in faces]
        elif self.backend == "yunet":
            self._yunet.setInputSize((small.shape[1], small.shape[0]))
            _, res = self._yunet.detect(np.ascontiguousarray(small[:, :, ::-1]))
            boxes = [(r[0], r[1], r[2], r[3], float(r[-1]), np.asarray(r[4:14], np.float32).reshape(5, 2))
                     for r in (res if res is not None else [])]
        else:
            boxes = [(x, y, bw, bh, 1.0, None) for x, y, bw, bh in detect_faces(small, min_size=24)]
        return [(float(x / s), float(y / s), float(bw / s), float(bh / s), sc, None if k is None else k / s)
                for x, y, bw, bh, sc, k in boxes if sc >= self.min_score and bw > 0 and bh > 0]
