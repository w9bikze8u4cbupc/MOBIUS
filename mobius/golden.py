from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any, Dict

from .config_models import GoldenBaselinesConfig


def run_ffmpeg(cmd):
    subprocess.run(cmd, check=True)


def capture_golden_frames(video_path: str, output_dir: Path, cfg: GoldenBaselinesConfig):
    output_dir.mkdir(parents=True, exist_ok=True)
    for t in cfg.timepoints_seconds:
        out = output_dir / f"frame-{t}s.png"
        cmd = [
            "ffmpeg",
            "-y",
            "-ss",
            str(t),
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            str(out),
        ]
        run_ffmpeg(cmd)


def compute_ssim(reference: Path, candidate: Path, masks=None):
    raise NotImplementedError("SSIM computation is not implemented in this environment")


def compute_psnr(reference: Path, candidate: Path):
    raise NotImplementedError("PSNR computation is not implemented in this environment")


def compute_vmaf(reference: Path, candidate: Path):
    raise NotImplementedError("VMAF computation is not implemented in this environment")


def evaluate_baseline(reference: Path, candidate: Path, cfg: GoldenBaselinesConfig) -> Dict[str, Any]:
    ssim = compute_ssim(reference, candidate, masks=cfg.masks)
    psnr = compute_psnr(reference, candidate)
    vmaf = compute_vmaf(reference, candidate)

    results = {
        "ssim": ssim,
        "psnr": psnr,
        "vmaf": vmaf,
        "pass_thresholds": (
            ssim >= cfg.metrics["ssim"]["threshold"]
            and psnr >= cfg.metrics["psnr"]["thresholdDb"]
            and vmaf >= cfg.metrics["vmaf"]["threshold"]
        ),
        "eligible_for_promotion": ssim >= cfg.metrics["ssim"]["promotionThreshold"],
    }
    return results
