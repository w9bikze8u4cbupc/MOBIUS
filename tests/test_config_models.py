from mobius.config_models import CaptionsConfig, LocalizationConfig, GoldenBaselinesConfig


def test_captions_config_loads():
    cfg = CaptionsConfig.load()
    assert cfg.format == "srt"
    assert cfg.encoding == "utf8"
    assert "en" in cfg.languages


def test_localization_config_loads():
    cfg = LocalizationConfig.load()
    assert cfg.default_locale == "en-US"
    assert "fr-FR" in cfg.locales
    assert "meeple" in cfg.do_not_translate


def test_golden_baselines_config_loads():
    cfg = GoldenBaselinesConfig.load()
    assert 10 in cfg.timepoints_seconds
    assert cfg.metrics["ssim"]["threshold"] == 0.95
