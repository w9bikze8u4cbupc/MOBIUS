from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
from typing import Any, Dict, List


CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"


def _load_json(name: str) -> Dict[str, Any]:
    with open(CONFIG_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


@dataclass
class CaptionsConfig:
    format: str
    encoding: str
    max_chars_per_line: int
    max_cps: int
    max_lines: int
    min_cue_ms: int
    min_gap_ms: int
    snap_to_word: bool
    lead_in_ms: int
    lead_out_ms: int
    non_speech_enabled: bool
    languages: List[str]

    @classmethod
    def load(cls) -> "CaptionsConfig":
        raw = _load_json("captions.json")
        timing = raw["timing"]
        return cls(
            format=raw["format"],
            encoding=raw["encoding"],
            max_chars_per_line=raw["maxCharsPerLine"],
            max_cps=raw["maxCps"],
            max_lines=raw["maxLines"],
            min_cue_ms=timing["minCueMs"],
            min_gap_ms=timing["minGapMs"],
            snap_to_word=timing["snapToWord"],
            lead_in_ms=timing["leadInMs"],
            lead_out_ms=timing["leadOutMs"],
            non_speech_enabled=raw["nonSpeech"]["enabled"],
            languages=raw["languages"],
        )


@dataclass
class LocalizationConfig:
    default_locale: str
    locales: Dict[str, Dict[str, str]]
    translation_pipeline: List[str]
    glossary_source: str
    lock_terminology: bool
    do_not_translate: List[str]
    subtitle_naming_pattern: str
    subtitle_locale_codes: Dict[str, str]
    forced_alignment_required: bool
    duration_source: str

    @classmethod
    def load(cls) -> "LocalizationConfig":
        raw = _load_json("localization.json")
        return cls(
            default_locale=raw["defaultLocale"],
            locales=raw["locales"],
            translation_pipeline=raw["translationPipeline"],
            glossary_source=raw["glossary"]["source"],
            lock_terminology=raw["glossary"]["lockTerminology"],
            do_not_translate=raw["doNotTranslate"],
            subtitle_naming_pattern=raw["rules"]["subtitleNaming"]["pattern"],
            subtitle_locale_codes=raw["rules"]["subtitleNaming"]["locales"],
            forced_alignment_required=raw["rules"]["forcedAlignmentRequired"],
            duration_source=raw["rules"]["durationSource"],
        )


@dataclass
class GoldenBaselinesConfig:
    timepoints_seconds: List[int]
    reference_resolution: str
    bypass_resolutions: List[str]
    masks: List[Dict[str, Any]]
    metrics: Dict[str, Any]
    promotion_requirements: List[str]
    promotion_label: str

    @classmethod
    def load(cls) -> "GoldenBaselinesConfig":
        raw = _load_json("goldenBaselines.json")
        return cls(
            timepoints_seconds=raw["capture"]["timepointsSeconds"],
            reference_resolution=raw["capture"]["referenceResolution"],
            bypass_resolutions=raw["capture"]["bypassResolutions"],
            masks=raw["masks"],
            metrics=raw["metrics"],
            promotion_requirements=raw["promotion"]["requirements"],
            promotion_label=raw["promotion"]["label"],
        )
