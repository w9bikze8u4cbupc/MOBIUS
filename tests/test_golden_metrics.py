from pathlib import Path

from mobius.config_models import GoldenBaselinesConfig
from mobius.golden import evaluate_baseline


def test_evaluate_baseline_promotion_logic(monkeypatch):
    cfg = GoldenBaselinesConfig.load()

    def fake_ssim(*args, **kwargs):
        return cfg.metrics["ssim"]["promotionThreshold"]

    def fake_psnr(*_args, **_kwargs):
        return cfg.metrics["psnr"]["thresholdDb"] + 1

    def fake_vmaf(*_args, **_kwargs):
        return cfg.metrics["vmaf"]["threshold"] + 1

    monkeypatch.setattr("mobius.golden.compute_ssim", fake_ssim)
    monkeypatch.setattr("mobius.golden.compute_psnr", fake_psnr)
    monkeypatch.setattr("mobius.golden.compute_vmaf", fake_vmaf)

    result = evaluate_baseline(Path("ref.mp4"), Path("cand.mp4"), cfg)
    assert result["pass_thresholds"] is True
    assert result["eligible_for_promotion"] is True
