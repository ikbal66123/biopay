"""Pelacakan wajah antar-frame (IoU + penghalusan), supaya kotak wajah stabil.

Kotak yang "goyang" dari frame ke frame akan membuat perturbasi ikut goyang
(terlihat sebagai kedip). Karena itu kotak dihaluskan dengan EMA, dan jika
detektor sesaat gagal (kedip mata, blur gerak) kotak terakhir dipertahankan
beberapa frame.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Track:
    id: int
    boxes: dict[int, tuple[float, float, float]] = field(default_factory=dict)  # frame -> (cx, cy, sisi)
    kps: dict = field(default_factory=dict)  # frame -> landmark (5, 2) mentah (tanpa smoothing), jika ada
    misses: int = 0
    hits: int = 0

    @property
    def frames(self) -> list[int]:
        return sorted(self.boxes)

    def last(self) -> tuple[float, float, float]:
        return self.boxes[max(self.boxes)]


def _iou(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    ax0, ay0, ax1, ay1 = a[0] - a[2] / 2, a[1] - a[2] / 2, a[0] + a[2] / 2, a[1] + a[2] / 2
    bx0, by0, bx1, by1 = b[0] - b[2] / 2, b[1] - b[2] / 2, b[0] + b[2] / 2, b[1] + b[2] / 2
    iw, ih = max(0.0, min(ax1, bx1) - max(ax0, bx0)), max(0.0, min(ay1, by1) - max(ay0, by0))
    inter = iw * ih
    return inter / (a[2] ** 2 + b[2] ** 2 - inter + 1e-9)


class FaceTracker:
    """Tracker sederhana: asosiasi greedy berdasarkan IoU, kotak persegi + margin."""

    def __init__(self, margin: float = 0.35, iou_thresh: float = 0.25, smooth: float = 0.6,
                 max_misses: int = 8, max_faces: int = 4) -> None:
        self.margin = margin
        self.iou_thresh = iou_thresh
        self.smooth = smooth
        self.max_misses = max_misses
        self.max_faces = max_faces
        self.active: list[Track] = []
        self.finished: list[Track] = []
        self._next = 0

    def _square(self, det) -> tuple[float, float, float]:
        x, y, w, h = det[:4]
        return (x + w / 2, y + h / 2, max(w, h) * (1 + 2 * self.margin))

    def cut(self) -> None:
        """Pergantian adegan: akhiri semua track (wajah di adegan baru = track baru)."""
        self.finished += self.active
        self.active = []

    def update(self, frame_idx: int, detections) -> None:
        dets = sorted(detections, key=lambda d: d[2] * d[3], reverse=True)[: self.max_faces]
        boxes = [self._square(d) for d in dets]
        unmatched = set(range(len(boxes)))
        pairs = sorted(((_iou(t.last(), b), ti, bi) for ti, t in enumerate(self.active) for bi, b in enumerate(boxes)),
                       reverse=True)
        used_t: set[int] = set()
        for iou, ti, bi in pairs:
            if iou < self.iou_thresh or ti in used_t or bi not in unmatched:
                continue
            t, b = self.active[ti], boxes[bi]
            p, a = t.last(), self.smooth
            t.boxes[frame_idx] = tuple(a * pv + (1 - a) * bv for pv, bv in zip(p, b))
            if len(dets[bi]) > 5 and dets[bi][5] is not None:
                t.kps[frame_idx] = dets[bi][5]
            t.misses, t.hits = 0, t.hits + 1
            used_t.add(ti)
            unmatched.discard(bi)
        for ti, t in enumerate(self.active):
            if ti not in used_t:
                t.misses += 1
                if t.misses <= self.max_misses:
                    t.boxes[frame_idx] = t.last()  # tahan kotak terakhir
        still = []
        for t in self.active:
            (still if t.misses <= self.max_misses else self.finished).append(t)
        self.active = still
        for bi in sorted(unmatched):
            t = Track(self._next, {frame_idx: boxes[bi]}, hits=1)
            if len(dets[bi]) > 5 and dets[bi][5] is not None:
                t.kps[frame_idx] = dets[bi][5]
            self._next += 1
            self.active.append(t)

    def tracks(self, min_hits: int = 3) -> list[Track]:
        """Semua track yang cukup panjang (membuang deteksi palsu sesaat).
        Frame "tahan" di ekor track (wajah sudah hilang) dibuang."""
        out = []
        for t in self.finished + self.active:
            if t.hits < min_hits:
                continue
            held = min(t.misses, self.max_misses)
            if held:
                for f in t.frames[-held:]:
                    del t.boxes[f]
                    t.kps.pop(f, None)
                t.misses = 0
            out.append(t)
        return sorted(out, key=lambda t: t.id)
