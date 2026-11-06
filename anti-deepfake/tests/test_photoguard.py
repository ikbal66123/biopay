import numpy as np
import torch

from antideepfake.augment import jpeg_ste
from antideepfake.metrics import psnr
from antideepfake.photoguard import EncoderAttack, make_config


def small_cfg(**kw):
    base = dict(steps=25, step_size=2 / 255, work_size=64, eot=False, random_init=False)
    base.update(kw)
    return make_config("fast", **base)


def test_perturbation_within_budget_and_size_preserved(tiny_vae, make_image):
    img = make_image(70, 90)  # bukan kelipatan 8 -> diuji juga resize internal
    res = EncoderAttack(tiny_vae, small_cfg(), "cpu").protect(img)
    assert res.image.shape == img.shape and res.image.dtype == np.uint8
    assert res.linf <= 8 + 1  # eps 8/255 (+1 karena pembulatan 8-bit)
    assert psnr(img, res.image) > 30


def test_attack_moves_latent_towards_target(tiny_vae, make_image):
    img = make_image(64, 64, seed=1)
    res = EncoderAttack(tiny_vae, small_cfg(steps=40), "cpu").protect(img)
    assert res.final_loss < 0.8 * res.initial_loss
    assert res.loss_history[-1] < res.loss_history[0]


def test_mask_limits_changes_to_face_region(tiny_vae, make_image):
    img = make_image(64, 64, seed=2)
    mask = np.zeros((64, 64), np.float32)
    mask[16:48, 16:48] = 1
    res = EncoderAttack(tiny_vae, small_cfg(), "cpu").protect(img, mask=mask)
    outside = mask == 0
    assert np.array_equal(res.image[outside], img[outside])
    assert not np.array_equal(res.image[~outside], img[~outside])


def test_eot_and_noise_target_and_ensemble_run(tiny_vae, make_image):
    img = make_image(64, 80, seed=3)
    cfg = small_cfg(steps=5, eot=True, eot_samples=2, target="noise", jpeg_prob=1.0)
    res = EncoderAttack([tiny_vae, tiny_vae], cfg, "cpu").protect(img)
    assert res.linf <= 9 and len(res.loss_history) == 5


def test_jpeg_straight_through_has_identity_gradient():
    x = torch.rand(1, 3, 16, 16, requires_grad=True)
    y = jpeg_ste(x, 75)
    y.sum().backward()
    assert torch.allclose(x.grad, torch.ones_like(x))
    assert not torch.allclose(y, x)  # forward benar-benar berubah karena JPEG


def test_large_image_optimized_small_then_upsampled(tiny_vae, make_image):
    from antideepfake.photoguard import EncoderAttack

    img = make_image(300, 260, seed=7)
    cfg = small_cfg(steps=3, opt_max_side=96)  # paksa jalur "optimasi kecil -> perbesar"
    res = EncoderAttack(tiny_vae, cfg, "cpu").protect(img)
    assert res.image.shape == img.shape and res.linf <= 9
    assert res.delta.shape == img.shape


def test_fit_ssim_respects_target(make_image):
    from antideepfake.metrics import ssim
    from antideepfake.pipeline import fit_ssim

    img = make_image(128, 128, seed=8)
    delta = np.random.default_rng(0).choice([-8.0, 8.0], size=img.shape).astype(np.float32)
    out, scale, s = fit_ssim(img, delta, 0.97)
    assert s >= 0.97 and 0 <= scale < 1 and abs(ssim(img, out) - s) < 1e-6


def test_crop_and_color_eot_keep_shape():
    from antideepfake.augment import color_jitter, random_crop_resize
    import random

    x = torch.rand(2, 3, 64, 48)
    assert random_crop_resize(x, 0.1, random.Random(0)).shape == x.shape
    assert color_jitter(x, 0.05, -0.05, 0.05).shape == x.shape
