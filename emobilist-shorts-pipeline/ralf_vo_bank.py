#!/usr/bin/env python3
"""Discover Ralf speech segments in RAW clips → sentence bank for VO reuse."""
from __future__ import annotations

import json
import re
import subprocess
import tempfile
from pathlib import Path

from build_short_v2 import probe_duration, run

DATA = Path(__file__).resolve().parent / "data"
VO_CANDIDATES = DATA / "raw" / "vo_candidates"
BANK_PATH = DATA / "ralf_vo_bank.json"

# Indoor/workshop clips more likely clean speech
PRIORITY_STEMS = {
    "IMG_0043", "IMG_0044", "IMG_0015", "IMG_0016", "IMG_0017", "IMG_0018",
    "IMG_0020", "IMG_0021", "IMG_1068", "IMG_1070", "IMG_1071", "IMG_1080",
}


def _extract_audio(video: Path, wav: Path) -> None:
    run(
        [
            "ffmpeg", "-y", "-i", str(video),
            "-vn", "-ac", "1", "-ar", "16000",
            "-af", "highpass=f=80,lowpass=f=8000",
            str(wav),
        ]
    )


def _audio_stats(wav: Path) -> dict:
    """Rough quality: rms + speech ratio via silencedetect."""
    r = subprocess.run(
        [
            "ffmpeg", "-i", str(wav), "-af",
            "volumedetect,astats=metadata=1:reset=1",
            "-f", "null", "-",
        ],
        capture_output=True, text=True,
    )
    txt = r.stderr
    rms = 0.0
    for line in txt.splitlines():
        if "RMS level dB" in line:
            try:
                rms = float(line.split("RMS level dB:")[-1].strip().split()[0])
            except ValueError:
                pass
    # silence detect
    r2 = subprocess.run(
        [
            "ffmpeg", "-i", str(wav), "-af",
            "silencedetect=noise=-35dB:d=0.25", "-f", "null", "-",
        ],
        capture_output=True, text=True,
    )
    dur = probe_duration(wav)
    silent = 0.0
    starts, ends = [], []
    for line in r2.stderr.splitlines():
        if "silence_start" in line:
            try:
                starts.append(float(line.split("silence_start:")[-1].strip()))
            except ValueError:
                pass
        if "silence_end" in line:
            try:
                ends.append(float(line.split("silence_end:")[-1].split("|")[0].strip()))
            except ValueError:
                pass
    for a, b in zip(starts, ends):
        silent += max(0, b - a)
    speech_ratio = max(0.0, min(1.0, 1.0 - silent / max(dur, 0.1)))
    return {"rms_db": rms, "speech_ratio": round(speech_ratio, 3), "dur": dur}


def transcribe_segments(wav: Path, lang_hint: str | None = None) -> list[dict]:
    from faster_whisper import WhisperModel

    model = WhisperModel("small", device="cpu", compute_type="int8")
    kwargs = {"word_timestamps": True, "vad_filter": True}
    if lang_hint:
        kwargs["language"] = lang_hint
    segments, info = model.transcribe(str(wav), **kwargs)
    lang = info.language or "de"
    out = []
    for seg in segments:
        text = (seg.text or "").strip()
        if len(text) < 8:
            continue
        words = seg.words or []
        if words:
            start = float(words[0].start)
            end = float(words[-1].end)
        else:
            start, end = float(seg.start), float(seg.end)
        if end - start < 0.6:
            continue
        out.append({
            "text": text,
            "start": round(start, 3),
            "end": round(end, 3),
            "dur": round(end - start, 3),
            "lang": lang,
        })
    return out


def score_segment(seg: dict, clip_stem: str, stats: dict) -> float:
    """Higher = better VO candidate."""
    sc = 0.0
    if clip_stem in PRIORITY_STEMS:
        sc += 0.25
    sc += min(0.35, stats["speech_ratio"] * 0.4)
    # prefer moderate loudness (-25 to -12 dB)
    rms = stats.get("rms_db", -40)
    if -28 <= rms <= -10:
        sc += 0.2
    elif -35 <= rms < -28:
        sc += 0.1
    dur = seg["dur"]
    if 1.5 <= dur <= 6.0:
        sc += 0.2
    elif 0.8 <= dur < 1.5:
        sc += 0.1
    # penalize very long rambling
    if dur > 8:
        sc -= 0.15
    word_count = len(seg["text"].split())
    if 3 <= word_count <= 18:
        sc += 0.15
    return round(sc, 3)


def scan_clip(video: Path, project: str) -> list[dict]:
    stem = video.stem.strip()
    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "audio.wav"
        _extract_audio(video, wav)
        stats = _audio_stats(wav)
        if stats["speech_ratio"] < 0.12 or stats["dur"] < 2:
            return []
        segs = transcribe_segments(wav)
        rows = []
        for i, seg in enumerate(segs):
            q = score_segment(seg, stem, stats)
            if q < 0.35:
                continue
            rows.append({
                "id": f"{project}:{video.name}:{i:02d}",
                "project": project,
                "clip": video.name,
                "clip_path": str(video),
                "start": seg["start"],
                "end": seg["end"],
                "dur": seg["dur"],
                "text": seg["text"],
                "lang": seg["lang"],
                "quality": q,
                "speech_ratio": stats["speech_ratio"],
            })
        return rows


def build_bank(force: bool = False) -> dict:
    if BANK_PATH.exists() and not force:
        return json.loads(BANK_PATH.read_text(encoding="utf-8"))

    all_rows: list[dict] = []
    for proj_dir in sorted(VO_CANDIDATES.iterdir()):
        if not proj_dir.is_dir():
            continue
        project = proj_dir.name
        for video in sorted(proj_dir.glob("*")):
            if video.suffix.lower() not in {".mov", ".mp4", ".m4v"}:
                continue
            if video.stat().st_size < 500_000:
                continue
            print(f"scan {project}/{video.name} ...", flush=True)
            try:
                rows = scan_clip(video, project)
                print(f"  -> {len(rows)} segments", flush=True)
                all_rows.extend(rows)
            except Exception as e:
                print(f"  warn {e}", flush=True)

    all_rows.sort(key=lambda r: r["quality"], reverse=True)
    bank = {
        "version": "raw_vo",
        "count": len(all_rows),
        "segments": all_rows,
        "by_lang": {
            "de": [r for r in all_rows if r["lang"].startswith("de")],
            "en": [r for r in all_rows if r["lang"].startswith("en")],
        },
    }
    BANK_PATH.parent.mkdir(parents=True, exist_ok=True)
    BANK_PATH.write_text(json.dumps(bank, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"bank: {len(all_rows)} segments -> {BANK_PATH}")
    return bank


def _score_match(beat_text: str, seg: dict, lang: str, project: str | None) -> float:
    beat_words = set(re.findall(r"\w+", beat_text.lower(), re.UNICODE))
    seg_words = set(re.findall(r"\w+", seg["text"].lower(), re.UNICODE))
    overlap = len(beat_words & seg_words)
    sc = overlap * 0.4 + seg["quality"] * 0.6
    if lang.startswith("de") and seg["lang"].startswith("de"):
        sc += 0.08
    elif lang.startswith("en") and seg["lang"].startswith("en"):
        sc += 0.08
    if project and seg["project"] == project:
        sc += 0.12
    return sc


def match_sentence(beat_text: str, lang: str, bank: dict, used: set[str], project: str | None = None) -> dict | None:
    """Pick best unused segment for a caption beat."""
    pool = bank["segments"]

    def pick(candidates: list[dict]) -> dict | None:
        best, best_sc = None, -1.0
        for seg in candidates:
            if seg["id"] in used:
                continue
            sc = _score_match(beat_text, seg, lang, project)
            if sc > best_sc:
                best_sc, best = sc, seg
        return best

    hit = pick(pool)
    if hit:
        return hit

    for seg in sorted(pool, key=lambda s: s["quality"], reverse=True):
        if seg["id"] not in used:
            return seg
    return None


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    b = build_bank(force=args.force)
    print("top 5:")
    for s in b["segments"][:5]:
        print(f"  [{s['quality']}] {s['text'][:60]}... ({s['clip']})")
