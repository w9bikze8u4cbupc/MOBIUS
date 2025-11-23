from __future__ import annotations

from typing import Dict

from .config_models import LocalizationConfig
from .captions import caption_filename


def machine_translate(text: str, src: str, tgt: str, do_not_translate=None) -> str:
    if do_not_translate is None:
        do_not_translate = []
    translated_words = []
    for token in text.split():
        clean = token.strip()
        if clean in do_not_translate:
            translated_words.append(token)
        else:
            translated_words.append(token)
    return " ".join(translated_words)


def llm_smooth_fr(text: str, tone: str) -> str:
    return text


def localize_script(english_script: str, cfg: LocalizationConfig) -> Dict[str, str]:
    en = english_script
    fr_raw = machine_translate(en, src="en", tgt="fr", do_not_translate=cfg.do_not_translate)
    fr_smooth = llm_smooth_fr(fr_raw, tone=cfg.locales["fr-FR"].get("tone", ""))

    return {"en-US": en, "fr-FR": fr_smooth}
