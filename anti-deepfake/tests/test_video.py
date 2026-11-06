import json
import shutil
import subprocess
from fractions import Fraction

import numpy as np
import pytest
import torch

from antideepfake.augment import chroma_subsample, h264_roundtrip_np
from antideepfake.metrics import psnr
from antideepfake.protect_video import (TrackPlan, VideoProtectConfig, _delta_at, canonical_mask, extract_crop,
                                        paste_delta, protect_video)
from antideepfake.tracking import FaceTracker, Track
from antideepfake.videoio import VideoWriter, iter_frames, probe

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="butuh ffmpeg")


class FixedDetector:
    """Detektor palsu: satu 'wajah' yang bergerak pelan, supaya test tidak butuh model."""

    def detect(self, frame):
        self.i = getattr(self, "i", -1) + 1
        return [(40 + self.i, 30, 48, 48, 0.99)]


def make_video(path, n=12, w=160, h=128, audio=True):
    from conftest import natural_image

    base = natural_image(h, w)
    aud = None
    if audio:
        aud = path.with_suffix(".m4a")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.5",
                        "-c:a", "aac", str(aud)], check=True)
    with VideoWriter(path, w, h, Fraction(24), audio=aud, audio_codec="aac", crf=10, preset="veryfast") as wr:
        for i in range(n):
            wr.write(np.roll(base, i, axis=1))
    return path


def test_video_roundtrip_preserves_format(tmp_path):
    src = make_video(tmp_path / "a.mp4")
    info = probe(src)
    frames = list(iter_frames(src))
    assert (info.width, info.height, info.fps) == (160, 128, Fraction(24))
    assert len(frames) == 12 and info.has_audio


def test_protect_video_end_to_end(tmp_path, tiny_vae):
    src = make_video(tmp_path / "in.mp4")
    cfg = VideoProtectConfig(key_interval=4, identity="off", crop_min=48, crop_max=64,
                             protect_overrides=dict(steps=3, h264_prob=0.5))
    rep = protect_video(src, tmp_path / "out.mp4", cfg, vaes=[tiny_vae], device="cpu",
                        detector=FixedDetector(), keep_audio=True, show_progress=False)
    a, b = probe(src), probe(rep["output_path"])
    assert (b.width, b.height, b.fps) == (a.width, a.height, a.fps)
    assert rep["output"]["frames"] == rep["input"]["frames"] == 12
    assert b.has_audio and abs(b.duration - a.duration) < 0.1
    assert len(rep["tracks"]) == 1 and rep["tracks"][0]["keyframes"] == 4  # frame 0, 4, 8, 11
    assert json.loads(open(rep["manifest"]).read())["protected"]["sha256"]
    # Area jauh dari wajah praktis tidak berubah (hanya noise encode ulang)
    o = list(iter_frames(src))
    p = list(iter_frames(rep["output_path"]))
    assert psnr(o[5][:, 120:], p[5][:, 120:]) > 38
    # Area wajah benar-benar berubah
    assert np.abs(o[5][30:78, 45:93].astype(int) - p[5][30:78, 45:93].astype(int)).mean() > 0.5


def test_delta_interpolation_is_linear_between_keyframes():
    t = Track(0, {f: (50.0, 50.0, 40.0) for f in range(11)})
    plan = TrackPlan(t, 8, keys=[0, 10])
    plan.deltas = {0: np.zeros((8, 8, 3), np.float32), 10: np.ones((8, 8, 3), np.float32)}
    assert np.allclose(_delta_at(plan, 5), 0.5)
    assert np.allclose(_delta_at(plan, 10), 1.0)
    assert _delta_at(plan, 20) is None  # frame di luar track


def test_crop_and_paste_handle_frame_edges():
    frame = np.full((50, 60, 3), 100, np.uint8)
    box = (5.0, 5.0, 30.0)  # sebagian keluar frame
    assert extract_crop(frame, box, 16).shape == (16, 16, 3)
    acc = np.zeros((50, 60, 3), np.float32)
    paste_delta(acc, np.ones((16, 16, 3), np.float32), box)
    assert acc[0, 0, 0] == pytest.approx(1.0) and acc[40, 50, 0] == 0


def test_tracker_smooths_and_holds_through_missed_detections():
    tr = FaceTracker(margin=0.0, max_misses=2)
    for i in range(5):
        tr.update(i, [(10 + i, 10, 20, 20, 1.0)])
    tr.update(5, [])  # detektor gagal sesaat -> kotak ditahan
    tr.update(6, [(16, 10, 20, 20, 1.0)])
    (t,) = tr.tracks()
    assert t.frames == list(range(7))
    xs = [t.boxes[f][0] for f in range(5)]
    assert all(b > a for a, b in zip(xs, xs[1:])) and xs[-1] < 24  # mengikuti tapi dihaluskan (lag)


def test_canonical_mask_shape():
    m = canonical_mask(64, 0.35)
    assert m.shape == (64, 64) and m[32, 32] == pytest.approx(1.0) and m[0, 0] < 0.01


def test_h264_and_chroma_simulation():
    rng = np.random.default_rng(1)
    frames = (rng.random((2, 32, 48, 3)) * 255).astype(np.uint8)
    out = h264_roundtrip_np(frames, 30)
    assert out.shape == frames.shape and not np.array_equal(out, frames)
    gray = torch.full((1, 3, 8, 8), 0.4)
    assert torch.allclose(chroma_subsample(gray), gray, atol=1e-5)


def test_affine_paste_matches_box_paste_for_pure_translation():
    from antideepfake.protect_video import paste_delta_affine

    d = np.random.default_rng(2).random((16, 16, 3)).astype(np.float32)
    a = np.zeros((40, 40, 3), np.float32)
    T = np.array([[1, 0, 10], [0, 1, 5]], np.float32)  # crop 16px -> frame, geser (10, 5)
    paste_delta_affine(a, d, T)
    assert np.allclose(a[5:21, 10:26], d, atol=1e-5) and a[:5].sum() == 0


def test_tracker_keeps_raw_landmarks():
    tr = FaceTracker()
    k = np.array([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]], np.float32)
    for i in range(3):
        tr.update(i, [(10, 10, 20, 20, 1.0, k + i)])
    (t,) = tr.tracks()
    assert np.allclose(t.kps[2], k + 2)
