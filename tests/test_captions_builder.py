from mobius.captions import CaptionSegment, build_srt
from mobius.config_models import CaptionsConfig


def test_build_srt_respects_min_duration():
    cfg = CaptionsConfig.load()
    segs = [CaptionSegment(start_ms=0, end_ms=200, text="Hello world.")]
    srt = build_srt(segs, cfg)
    assert "00:00:01,000" in srt
