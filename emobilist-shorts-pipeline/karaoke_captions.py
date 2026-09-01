"""Word-level karaoke ASS captions from audio (faster-whisper alignment)."""
from __future__ import annotations

import re
from pathlib import Path

from build_short_v2 import (
    CAPTION_FONT_SIZE,
    CAPTION_MARGIN_L,
    CAPTION_MARGIN_R,
    CAPTION_MARGIN_V,
    CAPTION_PLAY_RES_X,
    CAPTION_PLAY_RES_Y,
    _ass_ts,
)

KEYWORD_COLOR = "00E5FF"  # cyan highlight
WORDS_PER_GROUP = 3
WHISPER_MODEL = "small"


def _group_words(words: list[dict], group_size: int = WORDS_PER_GROUP) -> list[list[dict]]:
    groups: list[list[dict]] = []
    buf: list[dict] = []
    for w in words:
        buf.append(w)
        if len(buf) >= group_size:
            groups.append(buf)
            buf = []
    if buf:
        groups.append(buf)
    return groups


def transcribe_words(audio_path: Path, lang: str) -> list[dict]:
    """Return [{word, start, end}, ...] from VO audio."""
    from faster_whisper import WhisperModel

    model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    lang_code = "de" if lang.startswith("de") else "en"
    segments, _ = model.transcribe(
        str(audio_path),
        language=lang_code,
        word_timestamps=True,
        vad_filter=True,
    )
    words: list[dict] = []
    for seg in segments:
        if not seg.words:
            continue
        for w in seg.words:
            text = (w.word or "").strip()
            if not text:
                continue
            words.append(
                {
                    "word": text,
                    "start": float(w.start),
                    "end": float(w.end),
                }
            )
    return words


def write_karaoke_ass(
    path: Path,
    words: list[dict],
    keywords: list[str] | None = None,
) -> None:
    """Karaoke: 2-4 words per line, active word highlighted."""
    keywords = keywords or []
    kw_lower = {k.lower() for k in keywords if k}
    groups = _group_words(words, WORDS_PER_GROUP)

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {CAPTION_PLAY_RES_X}
PlayResY: {CAPTION_PLAY_RES_Y}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,{CAPTION_FONT_SIZE},&H00FFFFFF,&H000000FF,&H00000000,&HC0000000,-1,0,0,0,100,100,0,0,3,3.0,1.0,2,{CAPTION_MARGIN_L},{CAPTION_MARGIN_R},{CAPTION_MARGIN_V},1
Style: Active,DejaVu Sans,{CAPTION_FONT_SIZE},&H00{KEYWORD_COLOR},&H000000FF,&H00000000,&HC0000000,-1,0,0,0,105,105,0,0,3,3.5,1.0,2,{CAPTION_MARGIN_L},{CAPTION_MARGIN_R},{CAPTION_MARGIN_V},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events: list[str] = []
    for group in groups:
        if not group:
            continue
        g_start = group[0]["start"]
        g_end = group[-1]["end"]
        # Build full line with per-word karaoke timing
        parts: list[str] = []
        for i, w in enumerate(group):
            word = w["word"]
            # Escape ASS
            word_esc = word.replace("{", r"\{").replace("}", r"\}")
            is_kw = word.lower().strip(".,!?") in kw_lower
            # Karaoke: {\k<centiseconds>}word
            dur_cs = max(1, int(round((w["end"] - w["start"]) * 100)))
            if is_kw:
                parts.append(
                    rf"{{\k{dur_cs}}}{{\c&H{KEYWORD_COLOR}&}}{{\b1}}{word_esc}{{\b0}}{{\c}}"
                )
            else:
                parts.append(rf"{{\k{dur_cs}}}{word_esc}")
            if i < len(group) - 1:
                parts.append(" ")
        line = "".join(parts)
        events.append(
            f"Dialogue: 0,{_ass_ts(g_start)},{_ass_ts(g_end)},Default,,0,0,0,,{line}"
        )

    path.write_text(header + "\n".join(events) + "\n", encoding="utf-8")


def burn_karaoke(video: Path, audio: Path, out: Path, lang: str, keywords: list[str] | None = None) -> Path:
    """Transcribe VO, write karaoke ASS, burn into video."""
    words = transcribe_words(audio, lang)
    if not words:
        raise RuntimeError(f"Whisper found no words in {audio}")
    ass = out.with_suffix(".ass")
    write_karaoke_ass(ass, words, keywords=keywords)
    ass_esc = ass.resolve().as_posix().replace(":", "\\:").replace("'", r"\'")
    from build_short_v2 import run

    run(
        [
            "ffmpeg", "-y", "-i", str(video),
            "-vf", f"ass={ass_esc}",
            "-c:v", "libx264",
            "-preset", "veryfast", "-crf", "18",
            "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "192k",
            "-movflags", "+faststart",
            str(out),
        ]
    )
    return ass
