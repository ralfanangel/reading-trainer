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
YUNET_PATH = ROOT / "models" / "face_detection_yunet_2023mar.onnx"
_YUNET = None


def _yunet():
    global _YUNET
    if _YUNET is None and YUNET_PATH.exists():
        _YUNET = cv2.FaceDetectorYN.create(
            str(YUNET_PATH), "", (320, 320), 0.75, 0.3, 5000
        )
    return _YUNET


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


def _face_area_ratio(img) -> float:
    """
    Faceless QA score for one frame.
    Prefer YuNet (threshold 0.75). Haar only if YuNet model missing —
    Haar false-positives heavily on bike parts / textures.
    """
    h, w = img.shape[:2]
    best = 0.0
    min_h = h * 0.04
    det = _yunet()
    if det is not None:
        det.setInputSize((w, h))
        det.setScoreThreshold(0.75)
        _, faces = det.detect(img)
        if faces is not None and len(faces) > 0:
            for f in faces:
                fw, fh = float(f[2]), float(f[3])
                conf = float(f[-1]) if len(f) > 14 else 0.8
                aspect = fh / max(fw, 1.0)
                if fh < min_h or conf < 0.75 or aspect < 0.7 or aspect > 1.9:
                    continue
                area = (fw * fh) / (w * h)
                score = max(0.55, min(1.0, area * 8.0))
                best = max(best, score)
        return best
    # Haar fallback only without YuNet
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = FACE.detectMultiScale(
        gray, 1.1, 5, minSize=(int(w * 0.08), int(h * 0.08))
    )
    for x, y, fw, fh in faces:
        if fh < min_h:
            continue
        area = (fw * fh) / (w * h)
        best = max(best, max(0.55, min(1.0, area * 8.0)))
    return best


def face_score(path: Path, samples: int = 8) -> float:
    """0..1: use MAX across samples so brief talking-head moments fail QA."""
    dur = probe_duration(path)
    if dur <= 0:
        return 1.0
    scores = []
    for i in range(samples):
        t = dur * (0.06 + 0.88 * i / max(1, samples - 1))
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
        scores.append(_face_area_ratio(img))
    return float(max(scores)) if scores else 0.0


def pick_faceless_clips(clips: list[Path], n: int = 6, max_face: float = 0.12) -> list[Path]:
    ranked = sorted(((face_score(c), c) for c in clips), key=lambda x: x[0])
    good = [c for s, c in ranked if s <= max_face]
    if len(good) >= n:
        return good[:n]
    return [c for _, c in ranked[:n]]


def make_vertical_segment(
    src: Path,
    dst: Path,
    max_sec: float,
    start: float = 0.0,
    punch: bool = False,
    headless: bool = False,
):
    # Prefer product/board. headless=True: cut top ~45% of source first so faces leave frame.
    if headless:
        # Keep lower 55% of source (hands/board/product), then cover-crop to 9:16
        base = (
            "crop=iw:ih*0.55:0:ih*0.45,"
            "scale=1080:1920:force_original_aspect_ratio=increase,"
            "crop=1080:1920:(iw-1080)/2:(ih-1920)/2,"
        )
    else:
        base = (
            "scale=1080:1920:force_original_aspect_ratio=increase,"
            "crop=1080:1920:(iw-1080)/2:(ih-1920)/2+80,"
        )
    if punch:
        vf = (
            base
            + "zoompan=z='min(1.10\\,1+0.002*on)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,"
            "format=yuv420p"
        )
    else:
        vf = base + "fps=30,format=yuv420p"
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


# Caption sizing for 1080x1920 Shorts.
# ASS FontSize ≈ pixel glyph height when PlayResY matches video height.
# Target readable but NOT huge: ~4–6% of frame height (≈77–115px @ 1920).
# V2 bug: SRT force_style FontSize=48 against default PlayResY≈288 (~17% + top-pinned).
CAPTION_PLAY_RES_X = 1080
CAPTION_PLAY_RES_Y = 1920
CAPTION_FONT_SIZE = 56  # ~2.9% glyph @1920; 2-line block ~6% — decisively under V2's ~15–20% top bars
CAPTION_MAX_CHARS = 22  # smaller font allows slightly longer lines inside margins
CAPTION_MARGIN_V = 420  # lower-third with safe bottom gap
CAPTION_MARGIN_L = 120
CAPTION_MARGIN_R = 120


def wrap_caption(text: str, max_chars: int = CAPTION_MAX_CHARS) -> str:
    """Soft-wrap caption into ≤3 short lines; never one edge-to-edge giant line."""
    text = " ".join(text.replace("\n", " ").split())
    if len(text) <= max_chars:
        return text

    def split_once(s: str, limit: int) -> tuple[str, str]:
        if len(s) <= limit:
            return s, ""
        candidates = [i for i, ch in enumerate(s) if ch in " -—–→|/"]
        # Prefer break at/under limit
        under = [i for i in candidates if 4 <= i <= limit]
        if under:
            best = under[-1]
        elif candidates:
            best = min(candidates, key=lambda i: abs(i - limit))
        else:
            best = limit
        left = s[:best].rstrip(" -—–→|/")
        right = s[best:].lstrip(" -—–→|/")
        return left, right

    lines: list[str] = []
    rest = text
    for _ in range(3):
        if not rest:
            break
        if len(rest) <= max_chars:
            lines.append(rest)
            rest = ""
            break
        # Leave room for remaining lines
        left, rest = split_once(rest, max_chars)
        if left:
            lines.append(left)
        else:
            lines.append(rest[:max_chars])
            rest = rest[max_chars:]
    if rest:
        # Last-resort hard trim on final line
        lines[-1] = (lines[-1] + " " + rest).strip()
        if len(lines[-1]) > max_chars + 6:
            lines[-1] = lines[-1][: max_chars + 4].rstrip() + "…"
    return "\n".join(lines)


def _ass_ts(t: float) -> str:
    if t < 0:
        t = 0.0
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    cs = int(round((t - int(t)) * 100))
    if cs >= 100:
        cs = 99
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def write_ass(path: Path, lines: list[tuple[float, float, str]]):
    """Write ASS with explicit PlayRes so FontSize maps to real pixels."""
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {CAPTION_PLAY_RES_X}
PlayResY: {CAPTION_PLAY_RES_Y}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,{CAPTION_FONT_SIZE},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2.2,0.8,2,{CAPTION_MARGIN_L},{CAPTION_MARGIN_R},{CAPTION_MARGIN_V},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    for a, b, text in lines:
        wrapped = wrap_caption(text).replace("\n", r"\N")
        # Escape ASS special chars
        wrapped = wrapped.replace("{", r"\{").replace("}", r"\}")
        events.append(
            f"Dialogue: 0,{_ass_ts(a)},{_ass_ts(b)},Default,,0,0,0,,{wrapped}"
        )
    path.write_text(header + "\n".join(events) + "\n", encoding="utf-8")


def burn_captions(video: Path, srt: Path, out: Path):
    """
    Burn captions via ASS with PlayResX/Y = frame size.
    Previous V2 used SRT force_style FontSize=48 against default PlayResY≈288
    (≈17% of frame + MarginV=240 pinned text to the top). That is fixed here.
    """
    # Parse SRT → ASS so sizing is deterministic
    raw = srt.read_text(encoding="utf-8")
    blocks = re.split(r"\n\s*\n", raw.strip())
    parsed: list[tuple[float, float, str]] = []
    for block in blocks:
        lines = [ln for ln in block.splitlines() if ln.strip()]
        if len(lines) < 2:
            continue
        # Find timing line
        timing = next((ln for ln in lines if "-->" in ln), None)
        if not timing:
            continue
        a_s, b_s = [x.strip() for x in timing.split("-->")]
        def parse_srt_ts(ts: str) -> float:
            ts = ts.replace(",", ".")
            h, m, rest = ts.split(":")
            return int(h) * 3600 + int(m) * 60 + float(rest)
        text = " ".join(ln for ln in lines if ln is not timing and not ln.strip().isdigit())
        parsed.append((parse_srt_ts(a_s), parse_srt_ts(b_s), text))

    ass = srt.with_suffix(".ass")
    write_ass(ass, parsed)
    ass_esc = ass.resolve().as_posix().replace(":", "\\:").replace("'", r"\'")
    vf = f"ass={ass_esc}"
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
    max_face: float = 0.12,
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
                src,
                seg,
                max_sec=min(per, target_sec - t),
                punch=(i == 0),
                headless=(not allow_face),
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
        if not allow_face and final_face > 0.55:
            raise RuntimeError(
                f"faceless QA failed for {out_path.name}: face_score={final_face:.3f}"
            )
        print(
            f"Built v2 {out_path} ({meta['duration']:.1f}s) lang={lang} "
            f"faceless={not allow_face} face={final_face:.3f}"
        )
        return out_path
