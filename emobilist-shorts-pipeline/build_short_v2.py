#!/usr/bin/env python3
"""EMOBILIST Shorts V2 — language-locked, face-safe (no face without real VO), dense story."""
from __future__ import annotations

import json
import re
import subprocess
import tempfile
from pathlib import Path

import cv2

ROOT = Path("/tmp/shorts_pipeline")
OUT = ROOT / "out_v2"
SUBS = ROOT / "subs_v2"
MUSIC = ROOT / "music" / "bed_pulse.wav"
CASCADE = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
FACE = cv2.CascadeClassifier(CASCADE)

# Hard English phrases that must never appear on DE
DE_BANNED = [
    "fold in under",
    "wait for it",
    "follow @emobilistusa",
    "worth it?",
    "don't buy",
    "dont buy",
    "subscribe",
    "check this out",
    "oh my god",
    "let's go",
    "lets go",
    "first ride",
    "city-ride",
    "city ride",
    "acceleration punch",
    "dust. power",
    "big smiles",
    "pattern-interrupt",
    "setup in 1 line",
    "proof ride",
    "honest verdict",
    "too cheap",
    "full review",
    "full specs",
    "helmet test",
    "more tests → @emobilistusa",
    "more fatbikes → @emobilistusa",
    "honest test → @emobilistusa",
    "your kid will",
    "looks like a mini",
    "this ride looks",
    "this fold has",
    "your helmet can",
    "under $",
    "worth it",
    "deal or trap",
    "moped killer",
]

EN_BANNED = [
    "darfst du",
    "für wen",
    "folge @the.emobilist",
    "gesetz vs",
    "ehrlich:",
    "@the.emobilist",
    "zusammenklappen",
    "kofferraum",
    "rechtlage",
    "volltest",
    "klapprad",
    "beschleunigung",
]


def run(cmd, check=True):
    r = subprocess.run(cmd, check=check, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(r.stderr[-800:] if r.stderr else "ffmpeg fail")
    return r


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


def face_score(path: Path, samples: int = 5) -> float:
    """0..1 roughly: higher = more/larger faces. Prefer low scores for faceless shorts."""
    dur = probe_duration(path)
    if dur <= 0:
        return 1.0
    scores = []
    for i in range(samples):
        t = dur * (0.12 + 0.76 * i / max(1, samples - 1))
        tmp = Path(tempfile.mktemp(suffix=".jpg"))
        run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                f"{t:.2f}",
                "-i",
                str(path),
                "-frames:v",
                "1",
                "-q:v",
                "5",
                str(tmp),
            ],
            check=False,
        )
        if not tmp.exists():
            continue
        img = cv2.imread(str(tmp))
        tmp.unlink(missing_ok=True)
        if img is None:
            continue
        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = FACE.detectMultiScale(
            gray, 1.12, 5, minSize=(int(w * 0.07), int(h * 0.07))
        )
        area = 0.0
        for x, y, fw, fh in faces:
            area += (fw * fh) / (w * h)
        scores.append(min(1.0, area * 3.0))
    return sum(scores) / len(scores) if scores else 0.0


def pick_faceless_clips(clips: list[Path], n: int = 6, max_face: float = 0.15) -> list[Path]:
    ranked = sorted(((face_score(c), c) for c in clips), key=lambda x: x[0])
    good = [c for s, c in ranked if s <= max_face]
    if len(good) >= n:
        return good[:n]
    return [c for _, c in ranked[:n]]


def make_vertical_segment(
    src: Path, dst: Path, max_sec: float, start: float = 0.0, punch: bool = False
):
    # Prefer product/board: slight downward bias after cover-scale
    vf = (
        "scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920:(iw-1080)/2:(ih-1920)/2+80,"
        "fps=30,format=yuv420p"
    )
    if punch:
        vf = (
            "scale=1080:1920:force_original_aspect_ratio=increase,"
            "crop=1080:1920:(iw-1080)/2:(ih-1920)/2+60,"
            "zoompan=z='min(1.12\\,1+0.0025*on)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,"
            "format=yuv420p"
        )
    dur = min(max_sec, max(0.8, probe_duration(src) - start))
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
            "19",
            str(dst),
        ]
    )
    return dur


def write_srt(path: Path, lines: list[tuple[float, float, str]]):
    def ts(t):
        h = int(t // 3600)
        m = int((t % 3600) // 60)
        s = int(t % 60)
        ms = int(round((t - int(t)) * 1000))
        if ms >= 1000:
            ms = 999
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    chunks = []
    for i, (a, b, text) in enumerate(lines, 1):
        chunks.append(f"{i}\n{ts(a)} --> {ts(b)}\n{text}\n")
    path.write_text("\n".join(chunks), encoding="utf-8")


def burn_captions(video: Path, srt: Path, out: Path):
    srt_esc = srt.resolve().as_posix().replace(":", "\\:")
    vf = (
        f"subtitles={srt_esc}:force_style='FontName=DejaVu Sans,"
        f"FontSize=48,Bold=1,PrimaryColour=&H00FFFFFF,"
        f"OutlineColour=&H00000000,BorderStyle=3,Outline=3,Shadow=0,"
        f"Alignment=2,MarginV=240'"
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
            "19",
            str(out),
        ]
    )


def assert_language(lines: list[str], lang: str):
    """Refuse obvious cross-language leakage + wrong CTA handles."""
    joined = " ".join(lines).lower()
    if lang == "de":
        if "@emobilistusa" in joined:
            raise ValueError("DE language lock: wrong CTA @emobilistusa")
        if "@the.emobilist" not in joined and "emobilist" in joined:
            # CTA should use DE handle when present
            pass
        for b in DE_BANNED:
            if b in joined:
                raise ValueError(f"DE language lock violated: found '{b}'")
        # Latin common English function words that shouldn't dominate DE captions
        en_hits = re.findall(
            r"\b(the|your|this|that|with|from|looks|worth|honest|fold|review|specs)\b",
            joined,
        )
        # Allow product names; flag if too many English glue words
        if len(en_hits) >= 3:
            raise ValueError(f"DE language lock: English glue words {en_hits}")
    if lang == "en":
        if "@the.emobilist" in joined:
            raise ValueError("EN language lock: wrong CTA @the.emobilist")
        for b in EN_BANNED:
            if b in joined:
                raise ValueError(f"EN language lock violated: found '{b}'")


def assert_cta(cta: str, lang: str):
    c = cta.lower()
    if lang == "de" and "@the.emobilist" not in c:
        raise ValueError(f"DE CTA must include @the.emobilist, got: {cta}")
    if lang == "en" and "@emobilistusa" not in c:
        raise ValueError(f"EN CTA must include @emobilistusa, got: {cta}")


def lint_srt_file(srt_path: Path, lang: str):
    text = srt_path.read_text(encoding="utf-8")
    # Strip timing lines
    lines = [
        ln.strip()
        for ln in text.splitlines()
        if ln.strip()
        and not ln.strip().isdigit()
        and "-->" not in ln
    ]
    assert_language(lines, lang)
    return lines


def build_short_v2(
    clip_paths: list[Path],
    story: dict,
    out_path: Path,
    lang: str,
    target_sec: float = 30.0,
    allow_face: bool = False,
    music: Path = MUSIC,
    max_face: float = 0.15,
):
    """
    story = {
      hook: str,
      beats: [str, str, str, str],  # bridge, escalate, climax, payoff
      cta: str
    }
    """
    OUT.mkdir(parents=True, exist_ok=True)
    SUBS.mkdir(parents=True, exist_ok=True)
    hook = story["hook"]
    beats = list(story["beats"])
    cta = story["cta"]
    assert_cta(cta, lang)
    assert_language([hook, *beats, cta], lang)

    clips = list(clip_paths)
    if not allow_face:
        clips = pick_faceless_clips(clips, n=min(7, len(clips)), max_face=max_face)

    with tempfile.TemporaryDirectory(prefix="shortv2_") as td:
        td = Path(td)
        segs = []
        t = 0.0
        # 25–35s with frequent cuts
        n = max(5, min(8, len(clips)))
        clips = clips[:n]
        per = max(2.5, min(5.0, target_sec / n))
        for i, src in enumerate(clips):
            if t >= target_sec - 0.4:
                break
            seg = td / f"seg_{i:02d}.mp4"
            used = make_vertical_segment(
                src, seg, max_sec=min(per, target_sec - t), punch=(i == 0)
            )
            segs.append(seg)
            t += used

        concat_list = td / "list.txt"
        concat_list.write_text(
            "".join(f"file '{s.resolve()}'\n" for s in segs), encoding="utf-8"
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
        # Cap hard at ~35s
        if total > 35.5:
            trimmed = td / "silent_trim.mp4"
            run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(silent),
                    "-t",
                    "34.5",
                    "-c",
                    "copy",
                    str(trimmed),
                ]
            )
            silent = trimmed
            total = probe_duration(silent)

        # Dramaturgy timeline — denser mid beats
        srt_lines: list[tuple[float, float, str]] = []
        srt_lines.append((0.0, min(2.0, total * 0.07), hook))
        mid_start = 1.9
        mid_end = max(mid_start + 1, total - 3.2)
        slot = (mid_end - mid_start) / max(1, len(beats))
        for i, beat in enumerate(beats):
            a = mid_start + i * slot
            b = min(mid_end, a + slot - 0.08)
            srt_lines.append((a, b, beat))
        srt_lines.append((max(0, total - 2.8), total - 0.12, cta))

        srt = SUBS / (out_path.stem + ".srt")
        write_srt(srt, srt_lines)
        lint_srt_file(srt, lang)

        with_audio = td / "with_audio.mp4"
        if music.exists():
            run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(silent),
                    "-stream_loop",
                    "-1",
                    "-i",
                    str(music),
                    "-filter_complex",
                    f"[1:a]volume=0.18,afade=t=in:d=0.35,afade=t=out:st={max(0,total-1.6)}:d=1.6[a]",
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
                    "-t",
                    str(total),
                    str(with_audio),
                ]
            )

        burn_captions(with_audio, srt, out_path)
        (OUT / (out_path.stem + ".srt")).write_text(
            srt.read_text(encoding="utf-8"), encoding="utf-8"
        )

        # Face QA on final render when faceless mode
        final_face = face_score(out_path, samples=6) if not allow_face else 0.0
        meta = {
            "path": str(out_path),
            "duration": probe_duration(out_path),
            "lang": lang,
            "faceless": not allow_face,
            "face_score": round(final_face, 4),
            "hook": hook,
            "cta": cta,
        }
        (OUT / (out_path.stem + ".meta.json")).write_text(
            json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        if not allow_face and final_face > 0.28:
            print(
                f"WARN face_score high on {out_path.name}: {final_face:.3f} — consider re-pick"
            )
        print(
            f"Built v2 {out_path} ({meta['duration']:.1f}s) lang={lang} "
            f"faceless={not allow_face} face={final_face:.3f}"
        )
        return out_path
