from __future__ import annotations

from dataclasses import dataclass
from typing import List
from textwrap import wrap

from .config_models import CaptionsConfig


@dataclass
class CaptionSegment:
    start_ms: int
    end_ms: int
    text: str


def build_srt(segments: List[CaptionSegment], cfg: CaptionsConfig) -> str:
    """
    Build an SRT string enforcing timing and line-length rules.
    Assumes segments are already aligned to word boundaries.
    """
    lines: List[str] = []
    index = 1
    previous_end = None

    for seg in segments:
        start = max(0, seg.start_ms - cfg.lead_in_ms)
        end = seg.end_ms + cfg.lead_out_ms

        if end - start < cfg.min_cue_ms:
            end = start + cfg.min_cue_ms

        if previous_end is not None and start - previous_end < cfg.min_gap_ms:
            start = previous_end + cfg.min_gap_ms
            if end < start + cfg.min_cue_ms:
                end = start + cfg.min_cue_ms

        text_lines = _wrap_text(seg.text, cfg.max_chars_per_line, cfg.max_lines)
        if not text_lines:
            continue

        lines.append(str(index))
        lines.append(f"{_format_srt_time(start)} --> {_format_srt_time(end)}")
        lines.extend(text_lines)
        lines.append("")

        index += 1
        previous_end = end

    return "\n".join(lines)


def caption_filename(game_slug: str, locale: str, loc_cfg) -> str:
    short = loc_cfg.subtitle_locale_codes[locale]
    pattern = loc_cfg.subtitle_naming_pattern
    return pattern.format(game=game_slug, locale=short)


def _wrap_text(text: str, max_chars: int, max_lines: int) -> List[str]:
    if not text:
        return []

    tokens = text.split()
    if any(len(token) > max_chars for token in tokens):
        return []

    wrapped = wrap(
        text,
        width=max_chars,
        break_long_words=False,
        break_on_hyphens=False,
        max_lines=max_lines,
        placeholder="",
    )
    return wrapped[:max_lines]


def _format_srt_time(ms: int) -> str:
    hours, remainder = divmod(ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, millis = divmod(remainder, 1_000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"
