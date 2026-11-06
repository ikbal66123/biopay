import json

import numpy as np

from antideepfake.faces import face_mask
from antideepfake.imageio import jpeg_roundtrip, load_rgb, save_rgb
from antideepfake.metrics import psnr, ssim
from antideepfake.pipeline import protect_photo_file
from antideepfake.watermark import detect_watermark, embed_watermark


def test_watermark_roundtrip_and_owner_check(make_image):
    img = make_image(320, 400, seed=4)
    wm = embed_watermark(img, "ikbal")
    assert psnr(img, wm) > 45
    assert detect_watermark(wm, "ikbal")["owner_match"] is True
    assert detect_watermark(wm, "orang-lain")["owner_match"] is False
    assert detect_watermark(img, "ikbal")["owner_match"] is False


def test_watermark_survives_light_jpeg(make_image):
    img = make_image(400, 400, seed=5)
    wm = jpeg_roundtrip(embed_watermark(img, "ikbal"), 75)
    assert detect_watermark(wm, "ikbal")["bit_accuracy"] >= 0.9


def test_metrics_identical_images(make_image):
    img = make_image(40, 40)
    assert psnr(img, img) == float("inf")
    assert abs(ssim(img, img) - 1.0) < 1e-9


def test_face_mask_shape_and_range():
    m = face_mask((100, 120), [(40, 30, 30, 30)])
    assert m.shape == (100, 120) and m.max() == 1.0 and m.min() == 0.0
    assert m[45, 55] == 1.0 and m[0, 0] == 0.0


def test_pipeline_end_to_end(tmp_path, tiny_vae, make_image):
    src = tmp_path / "foto.jpg"
    save_rgb(make_image(300, 280, seed=6), src)
    rep = protect_photo_file(
        src, owner="ikbal", vaes=[tiny_vae], device="cpu",
        config_overrides=dict(steps=5, work_size=64, eot=False),
    )
    out = load_rgb(rep["output"])
    assert rep["output"].endswith("foto_protected.png")
    assert out.shape == load_rgb(src).shape
    assert rep["watermark"]["dct"]["owner_match"] is True
    man = json.loads(open(rep["manifest"]).read())
    assert len(man["original"]["sha256"]) == 64 and man["imperceptibility"]["psnr_db"] > 30


def test_second_layer_failure_falls_back_to_dct(make_image, monkeypatch):
    from antideepfake import watermark as wm

    def boom(*a, **k):
        raise ModuleNotFoundError("No module named 'imwatermark'")

    monkeypatch.setitem(wm.SECOND_LAYER, "rivagan", (boom, boom))
    img = make_image(256, 256, seed=9)
    out = wm.embed_layers(img, "ikbal", "rivagan")
    res = wm.detect_layers(out, "ikbal", "rivagan")
    assert res["dct"]["owner_match"] is True and "error" in res["rivagan"]
