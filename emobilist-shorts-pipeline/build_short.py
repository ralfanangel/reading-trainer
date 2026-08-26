#!/usr/bin/env python3
"""EMOBILIST Shorts builder: stitch clips → 9:16 → captions → music → export."""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path("/tmp/shorts_pipeline")
OUT = ROOT / "out"
SUBS = ROOT / "subs"
MUSIC = ROOT / "music" / "bed_pulse.wav"


def run(cmd, check=True):
    print("+", " ".join(str(c) for c in cmd[:8]), "..." if len(cmd) > 8 else "")
    return subprocess.run(cmd, check=check, capture_output=True, text=True)


def probe_duration(path: Path) -> float:
    r = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            str(path),
        ]
    )
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def probe_wh(path: Path):
    r = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0",
            str(path),
        ]
    )
    parts = r.stdout.strip().split(",")
    return int(parts[0]), int(parts[1])


def make_vertical_segment(src: Path, dst: Path, max_sec: float = 8.0, start: float = 0.0):
    """Center-crop landscape (or pad portrait) to 1080x1920, up to max_sec."""
    w, h = probe_wh(src)
    # scale to cover 1080x1920 then crop
    vf = (
        "scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,"
        "fps=30,"
        "format=yuv420p"
    )
    dur = min(max_sec, max(0.5, probe_duration(src) - start))
    run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            str(start),
            "-t",
            str(dur),
            "-i",
            str(src),
            "-vf",
            vf,
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            str(dst),
        ]
    )
    return dur


def burn_captions(video: Path, srt: Path, out: Path, font_size: int = 18)  # PlayResY≈288 units; 18≈6% — prefer build_short_v2 ASS:
    # Escape path for ffmpeg force_style
    srt_esc = str(srt).replace("\\", "/").replace(":", "\\:")
    vf = (
        f"subtitles={srt_esc}:force_style='FontName=DejaVu Sans,"
        f"FontSize={font_size},Bold=1,PrimaryColour=&H00FFFFFF,"
        f"OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,"
        f"Alignment=2,MarginV=48'"
    )
    run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(video),
            "-vf",
            vf,
            "-c:a",
            "copy",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            str(out),
        ]
    )


def write_srt(path: Path, lines: list[tuple[float, float, str]]):
    def ts(t):
        h = int(t // 3600)
        m = int((t % 3600) // 60)
        s = int(t % 60)
        ms = int((t - int(t)) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    chunks = []
    for i, (a, b, text) in enumerate(lines, 1):
        chunks.append(f"{i}\n{ts(a)} --> {ts(b)}\n{text}\n")
    path.write_text("\n".join(chunks), encoding="utf-8")


def build_short(
    clip_paths: list[Path],
    captions: list[str],
    out_path: Path,
    target_sec: float = 45.0,
    music: Path = MUSIC,
    hook_caption: str | None = None,
):
    OUT.mkdir(parents=True, exist_ok=True)
    SUBS.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="short_") as td:
        td = Path(td)
        segs = []
        t = 0.0
        per = max(4.0, min(8.0, target_sec / max(1, len(clip_paths))))
        for i, src in enumerate(clip_paths):
            if t >= target_sec:
                break
            seg = td / f"seg_{i:02d}.mp4"
            used = make_vertical_segment(src, seg, max_sec=min(per, target_sec - t))
            # punch-in zoom on first segment (hook)
            if i == 0:
                zoomed = td / "seg_00_zoom.mp4"
                run(
                    [
                        "ffmpeg",
                        "-y",
                        "-i",
                        str(seg),
                        "-vf",
                        "zoompan=z='min(1.12\\,1+0.002*on)':d=1:s=1080x1920:fps=30,format=yuv420p",
                        "-an",
                        "-c:v",
                        "libx264",
                        "-preset",
                        "veryfast",
                        "-crf",
                        "20",
                        str(zoomed),
                    ]
                )
                seg = zoomed
            segs.append((seg, used))
            t += used

        # concat
        concat_list = td / "list.txt"
        concat_list.write_text(
            "".join(f"file '{s.resolve()}'\n" for s, _ in segs), encoding="utf-8"
        )
        silent = td / "silent.mp4"
        run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_list),
                "-c",
                "copy",
                str(silent),
            ]
        )
        total = probe_duration(silent)

        # captions timeline
        srt_lines = []
        if hook_caption:
            srt_lines.append((0.0, min(2.5, total), hook_caption))
        # distribute remaining captions across timeline
        cap_list = captions[:]
        if not cap_list:
            cap_list = ["EMOBILIST"]
        slot = max(2.5, total / len(cap_list))
        t0 = 2.2 if hook_caption else 0.0
        for i, cap in enumerate(cap_list):
            a = t0 + i * slot
            b = min(total - 0.3, a + slot - 0.15)
            if a >= total:
                break
            srt_lines.append((a, max(a + 0.8, b), cap))
        # CTA last 3s
        srt_lines.append((max(0, total - 3.2), total - 0.2, "Follow @the.emobilist ⚡"))

        srt = SUBS / (out_path.stem + ".srt")
        write_srt(srt, srt_lines)

        captioned = td / "captioned.mp4"
        # add silent audio then mix music
        with_audio = td / "with_audio.mp4"
        music_path = music if music.exists() else None
        if music_path:
            run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(silent),
                    "-stream_loop",
                    "-1",
                    "-i",
                    str(music_path),
                    "-filter_complex",
                    f"[1:a]volume=0.22,afade=t=in:d=0.5,afade=t=out:st={max(0,total-2)}:d=2[a]",
                    "-map",
                    "0:v",
                    "-map",
                    "[a]",
                    "-t",
                    str(total),
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "128k",
                    "-shortest",
                    str(with_audio),
                ]
            )
        else:
            run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(silent),
                    "-f",
                    "lavfi",
                    "-i",
                    "anullsrc=r=44100:cl=stereo",
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-shortest",
                    str(with_audio),
                ]
            )

        burn_captions(with_audio, srt, out_path)
        # also copy srt alongside
        (OUT / (out_path.stem + ".srt")).write_text(srt.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"Built {out_path} ({probe_duration(out_path):.1f}s)")
        return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clips", nargs="+", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--hook", default="")
    ap.add_argument("--captions", nargs="*", default=[])
    ap.add_argument("--seconds", type=float, default=45)
    args = ap.parse_args()
    build_short(
        [Path(c) for c in args.clips],
        args.captions,
        Path(args.out),
        target_sec=args.seconds,
        hook_caption=args.hook or None,
    )


if __name__ == "__main__":
    main()
