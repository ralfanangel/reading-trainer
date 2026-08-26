#!/usr/bin/env python3
"""EMOBILIST Shorts V5 — viral structure enforcer.

STOP → CURIOSITY → ESCALATION → PAYOFF → LOOP

Enforces:
- Hook visual ≤2.0s
- Beat visual changes ≤3.0s
- V4 visual_plan beat→clip matching (unchanged hard rule)
- ASS captions FontSize=56 + keyword highlight (color/bold, no size bloat)
- Music variance + ducking; prefer mix with original clip audio
- Informative VO (edge-tts) with concrete product facts; CTA brief at end
- Motion-scored RAW preference for action beats
- Structure phase markers in timeline meta
"""
from __future__ import annotations

import asyncio
import json
import re
import tempfile
from pathlib import Path

import cv2

from build_short_v2 import (
    CAPTION_FONT_SIZE,
    CAPTION_MARGIN_L,
    CAPTION_MARGIN_R,
    CAPTION_MARGIN_V,
    CAPTION_PLAY_RES_X,
    CAPTION_PLAY_RES_Y,
    assert_cta,
    assert_language,
    face_score,
    lint_srt_file,
    make_vertical_segment,
    probe_duration,
    run,
    wrap_caption,
    write_srt,
    _ass_ts,
)
from build_short_v4 import (
    CURATED,
    _vertical_segment_topbias,
    pick_clip_for_beat,
    tags_for_clip,
)

ROOT = Path("/tmp/shorts_pipeline")
OUT = ROOT / "out_v5"
SUBS = ROOT / "subs_v5"
VO_DIR = ROOT / "vo_v5"
MOTION_SCORES = ROOT / "v5_action_scene_scores.json"
MOTION_BONUS = ROOT / "v5_motion_bonus_tags.json"

HOOK_MAX_SEC = 2.0
BEAT_MAX_SEC = 3.0
MUSIC_BASE_VOL = 0.08
MUSIC_DUCK_VOL = 0.04
ORIG_SOUND_VOL = 0.45
VO_VOL = 1.05
# ASS keyword highlight: cyan-ish BGR as &HAABBGGRR (ASS uses AABBGGRR)
KEYWORD_COLOR = "00E5FF"  # yellow-cyan highlight on white

VOICES = {
    "de": "de-DE-ConradNeural",
    "en": "en-US-AndrewNeural",
}

# Inject motion-bonus curated tags once
if MOTION_BONUS.exists():
    try:
        bonus = json.loads(MOTION_BONUS.read_text(encoding="utf-8"))
        for proj, clips in bonus.items():
            CURATED.setdefault(proj, {})
            for stem, tags in clips.items():
                CURATED[proj][stem] = sorted(
                    set(CURATED[proj].get(stem, [])) | set(tags)
                )
    except Exception as e:
        print("motion bonus warn", e)


def load_motion_map(project: str) -> dict[str, float]:
    if not MOTION_SCORES.exists():
        return {}
    try:
        data = json.loads(MOTION_SCORES.read_text(encoding="utf-8"))
    except Exception:
        return {}
    out = {}
    for row in data.get(project) or []:
        out[row["clip"]] = float(row.get("motion") or 0.0)
    return out


def pick_clip_for_beat_v5(
    clips: list[Path],
    project: str,
    need: list[str],
    used: set[str],
    avoid: list[str] | None = None,
    prefer_motion: bool = False,
    motion_map: dict[str, float] | None = None,
):
    """Tag match first; when prefer_motion, break ties toward higher motion."""
    motion_map = motion_map or {}
    chosen, sc, tags = pick_clip_for_beat(
        clips, project, need, used, avoid=avoid
    )
    if not prefer_motion or not motion_map:
        return chosen, sc, tags
    # Re-rank among clips with score within 0.15 of best
    best = None
    best_score = -1.0
    best_tags: set[str] = set()
    best_motion = -1.0
    from build_short_v4 import score_clip_for_need

    for c in clips:
        tgs = tags_for_clip(project, c)
        s = score_clip_for_need(tgs, need, avoid)
        if c.name in used:
            s -= 0.12
        if s < 0.34:
            continue
        mot = motion_map.get(c.name, 0.0)
        # Combined: tag score primary, motion secondary
        combined = s + min(0.35, mot / 200.0)
        if combined > best_score + 1e-6 or (
            abs(combined - best_score) < 1e-6 and mot > best_motion
        ):
            best_score = combined
            best = c
            best_tags = tgs
            best_motion = mot
    if best is None:
        return chosen, sc, tags
    return best, round(best_score, 3), best_tags


async def _edge_tts_save(text: str, voice: str, out_mp3: Path):
    import edge_tts

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(out_mp3))


def synthesize_vo_line(text: str, lang: str, out_wav: Path) -> float:
    """Generate one VO line via edge-tts; return duration seconds."""
    VO_DIR.mkdir(parents=True, exist_ok=True)
    voice = VOICES["de" if lang.startswith("de") else "en"]
    mp3 = out_wav.with_suffix(".mp3")
    asyncio.run(_edge_tts_save(text, voice, mp3))
    # Convert to wav 44.1 stereo for mixing
    run(
        [
            "ffmpeg", "-y", "-i", str(mp3),
            "-ac", "2", "-ar", "44100",
            str(out_wav),
        ]
    )
    return probe_duration(out_wav)


INFO_HINTS = re.compile(
    r"(\d+\s?(km/h|mph|€|\$|sek|sec|s\b|°)|akku|battery|klapp|fold|"
    r"blinker|remote|scharnier|hinge|reichweite|range|rechtlage|rules|"
    r"helm|helmet|punch|drehmoment|torque|fat.?tire|pint\s?x)",
    re.I,
)


def vo_has_info(lines: list[str]) -> bool:
    joined = " ".join(lines)
    return bool(INFO_HINTS.search(joined)) and len(joined) > 80


def _highlight_keywords(text: str, keywords: list[str] | None) -> str:
    """Wrap keyword occurrences in ASS color/bold overrides. Size stays FontSize=56."""
    if not keywords:
        return text
    out = text
    # Longest first to avoid partial overlaps
    for kw in sorted({k for k in keywords if k}, key=len, reverse=True):
        if not kw:
            continue
        pattern = re.compile(re.escape(kw), re.IGNORECASE)

        def repl(m: re.Match) -> str:
            return (
                r"{\c&H"
                + KEYWORD_COLOR
                + r"&}{\b1}"
                + m.group(0)
                + r"{\b0}{\c}"
            )

        out = pattern.sub(repl, out, count=1)
    return out


def write_ass_v5(
    path: Path,
    lines: list[tuple[float, float, str, list[str] | None]],
):
    """ASS with PlayRes + keyword highlight styles. FontSize stays 56."""
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {CAPTION_PLAY_RES_X}
PlayResY: {CAPTION_PLAY_RES_Y}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,{CAPTION_FONT_SIZE},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2.2,0.8,2,{CAPTION_MARGIN_L},{CAPTION_MARGIN_R},{CAPTION_MARGIN_V},1
Style: Keyword,DejaVu Sans,{CAPTION_FONT_SIZE},&H00{KEYWORD_COLOR},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2.6,0.8,2,{CAPTION_MARGIN_L},{CAPTION_MARGIN_R},{CAPTION_MARGIN_V},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    for a, b, text, kws in lines:
        wrapped = wrap_caption(text).replace("\n", r"\N")
        wrapped = wrapped.replace("{", r"\{").replace("}", r"\}")
        wrapped = _highlight_keywords(wrapped, kws)
        events.append(
            f"Dialogue: 0,{_ass_ts(a)},{_ass_ts(b)},Default,,0,0,0,,{wrapped}"
        )
    path.write_text(header + "\n".join(events) + "\n", encoding="utf-8")


def burn_captions_v5(
    video: Path,
    srt: Path,
    out: Path,
    keywords_per_line: list[list[str] | None],
):
    raw = srt.read_text(encoding="utf-8")
    blocks = re.split(r"\n\s*\n", raw.strip())
    parsed: list[tuple[float, float, str]] = []
    for block in blocks:
        lines = [ln for ln in block.splitlines() if ln.strip()]
        if len(lines) < 2:
            continue
        timing = next((ln for ln in lines if "-->" in ln), None)
        if not timing:
            continue
        a_s, b_s = [x.strip() for x in timing.split("-->")]

        def parse_srt_ts(ts: str) -> float:
            ts = ts.replace(",", ".")
            h, m, rest = ts.split(":")
            return int(h) * 3600 + int(m) * 60 + float(rest)

        text = " ".join(
            ln for ln in lines if ln is not timing and not ln.strip().isdigit()
        )
        parsed.append((parse_srt_ts(a_s), parse_srt_ts(b_s), text))

    ass_lines = []
    for i, (a, b, text) in enumerate(parsed):
        kws = keywords_per_line[i] if i < len(keywords_per_line) else None
        ass_lines.append((a, b, text, kws))

    ass = SUBS / (out.stem + ".ass")
    SUBS.mkdir(parents=True, exist_ok=True)
    write_ass_v5(ass, ass_lines)
    # Also keep beside srt
    srt.with_suffix(".ass").write_text(ass.read_text(encoding="utf-8"), encoding="utf-8")
    ass_esc = ass.resolve().as_posix().replace(":", "\\:").replace("'", r"\'")
    run(
        [
            "ffmpeg", "-y", "-i", str(video),
            "-vf", f"ass={ass_esc}",
            "-c:a", "copy", "-c:v", "libx264",
            "-preset", "veryfast", "-crf", "19",
            str(out),
        ]
    )


def _normalize_story(
    story: dict,
) -> tuple[list[str], list[dict], list[list[str]], list[dict], list[str]]:
    """Expand hook/beats/cta/loop into caption list + structure + keywords + visual_plan + VO."""
    hook = story["hook"]
    beats = list(story["beats"])
    cta = story["cta"]
    loop = story.get("loop")
    captions = [hook, *beats, cta]
    if loop:
        captions.append(loop)

    structure = list(story.get("structure") or [])
    visual_plan = list(story["visual_plan"])
    keywords = list(story.get("keywords") or [])
    vo_lines = list(story.get("vo") or [])

    if len(visual_plan) != len(captions):
        raise ValueError(
            f"visual_plan length {len(visual_plan)} != captions {len(captions)}"
        )
    if structure and len(structure) != len(captions):
        raise ValueError(
            f"structure length {len(structure)} != captions {len(captions)}"
        )
    # Pad keywords
    while len(keywords) < len(captions):
        keywords.append([])
    keywords = [list(k) if k else [] for k in keywords[: len(captions)]]

    # Pad / derive VO from captions if missing
    if not vo_lines:
        vo_lines = list(captions)
    while len(vo_lines) < len(captions):
        vo_lines.append(captions[len(vo_lines)])
    vo_lines = vo_lines[: len(captions)]

    if not structure:
        # Default viral phases
        structure = []
        for i, vp in enumerate(visual_plan):
            if i == 0:
                phase, mx = "STOP", HOOK_MAX_SEC
            elif i == 1:
                phase, mx = "CURIOSITY", BEAT_MAX_SEC
            elif i >= len(captions) - 2:
                phase, mx = "LOOP", 2.5
            elif i == len(captions) - 3:
                phase, mx = "PAYOFF", BEAT_MAX_SEC
            else:
                phase, mx = "ESCALATION", BEAT_MAX_SEC
            structure.append(
                {
                    "phase": phase,
                    "label": vp.get("label") or f"beat{i}",
                    "max_sec": mx,
                }
            )
    return captions, structure, keywords, visual_plan, vo_lines


def lint_structure(structure: list[dict]) -> list[str]:
    warns = []
    phases = [s.get("phase") for s in structure]
    if phases and phases[0] != "STOP":
        warns.append(f"first phase should be STOP, got {phases[0]}")
    if "CURIOSITY" not in phases:
        warns.append("missing CURIOSITY phase")
    if "PAYOFF" not in phases:
        warns.append("missing PAYOFF phase")
    if "LOOP" not in phases:
        warns.append("missing LOOP phase")
    if structure and float(structure[0].get("max_sec", 99)) > HOOK_MAX_SEC + 0.01:
        warns.append(
            f"STOP max_sec={structure[0].get('max_sec')} > {HOOK_MAX_SEC}"
        )
    return warns


def build_short_v5(
    clip_paths: list[Path],
    story: dict,
    out_path: Path,
    lang: str,
    project: str,
    music: Path,
    target_sec: float = 38.0,
    allow_face: bool = False,
    max_face: float = 0.55,
    evidence_dir: Path | None = None,
    prefer_original_sound: bool = True,
) -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    SUBS.mkdir(parents=True, exist_ok=True)

    captions, structure, keywords, plan, vo_lines = _normalize_story(story)
    assert_cta(story["cta"], lang)
    assert_language(captions, lang)
    struct_warns = lint_structure(structure)
    if struct_warns:
        print("structure warnings:", struct_warns)
    if not vo_has_info(vo_lines):
        print("WARNING: VO lines look thin on concrete info")

    clips = list(clip_paths)
    if not clips:
        raise RuntimeError("no clips")
    catalog = {c.name: sorted(tags_for_clip(project, c)) for c in clips}
    motion_map = load_motion_map(project)

    with tempfile.TemporaryDirectory(prefix="shortv5_") as td:
        td = Path(td)
        n = len(captions)
        # Cap each beat by structure max_sec (hook ≤2, others ≤3)
        max_durs = []
        for i, st in enumerate(structure):
            mx = float(st.get("max_sec") or BEAT_MAX_SEC)
            if i == 0:
                mx = min(mx, HOOK_MAX_SEC)
            else:
                mx = min(mx, BEAT_MAX_SEC)
            max_durs.append(mx)
        # Scale to target if sum is short/long
        sum_max = sum(max_durs)
        if sum_max > target_sec:
            scale = target_sec / sum_max
            max_durs = [max(1.2, d * scale) for d in max_durs]
            max_durs[0] = min(max_durs[0], HOOK_MAX_SEC)

        segs = []
        audio_segs = []
        timeline = []
        used: set[str] = set()
        t_cursor = 0.0

        # Pre-generate VO to size beats (cap hook≤2 / beat≤3; speed up if VO longer)
        vo_wavs: list[Path] = []
        vo_durs: list[float] = []
        for i, line in enumerate(vo_lines):
            vw = td / f"vo_{i:02d}.wav"
            try:
                d = synthesize_vo_line(line, lang, vw)
            except Exception as e:
                print(f"VO synth fail beat{i}: {e}; silence fallback")
                run(
                    [
                        "ffmpeg", "-y", "-f", "lavfi",
                        "-i", "anullsrc=r=44100:cl=stereo",
                        "-t", "1.5", str(vw),
                    ]
                )
                d = 1.5
            hard = HOOK_MAX_SEC if i == 0 else BEAT_MAX_SEC
            if d > hard - 0.05:
                # Speed up to fit (max ~1.35x)
                speed = min(1.35, d / (hard - 0.08))
                sped = td / f"vo_{i:02d}_fast.wav"
                run(
                    [
                        "ffmpeg", "-y", "-i", str(vw),
                        "-filter:a", f"atempo={speed:.3f}",
                        str(sped),
                    ]
                )
                vw = sped
                d = probe_duration(vw)
            vo_wavs.append(vw)
            vo_durs.append(d)
            # Expand beat budget toward VO length (still hard-capped)
            target_beat = min(hard, max(max_durs[i], d + 0.12))
            max_durs[i] = target_beat

        # Re-scale if total over target
        sum_max = sum(max_durs)
        if sum_max > target_sec:
            scale = target_sec / sum_max
            max_durs = [
                min(HOOK_MAX_SEC if i == 0 else BEAT_MAX_SEC, max(1.15, d * scale))
                for i, d in enumerate(max_durs)
            ]

        for i, (cap, vp, st, kws, max_d) in enumerate(
            zip(captions, plan, structure, keywords, max_durs)
        ):
            need = list(vp.get("need") or [])
            avoid = list(vp.get("avoid") or [])
            label = vp.get("label") or st.get("label") or f"beat{i}"
            phase = st.get("phase") or "ESCALATION"

            prefer_motion = bool(vp.get("prefer_motion")) or phase in (
                "STOP",
                "CURIOSITY",
                "ESCALATION",
            ) or bool(
                set(need)
                & {"street_ride", "ride", "dust", "fold", "folding", "blinker_light"}
            )
            chosen, sc, tags = pick_clip_for_beat_v5(
                clips,
                project,
                need,
                used,
                avoid=avoid,
                prefer_motion=prefer_motion,
                motion_map=motion_map,
            )
            if chosen is None or (isinstance(sc, float) and sc < 0.34):
                for loose in (
                    [need[:1]] if need else [],
                    [["product"], ["product_close"], ["workshop"], ["ride"]],
                ):
                    chosen, sc, tags = pick_clip_for_beat_v5(
                        clips,
                        project,
                        loose,
                        used,
                        avoid=avoid,
                        prefer_motion=True,
                        motion_map=motion_map,
                    )
                    if chosen is not None and sc >= 0.34:
                        break
            if chosen is None:
                raise RuntimeError(
                    f"No matching clip for beat '{cap}' need={need} in {project}"
                )
            used.add(chosen.name)

            product_priority = bool(
                tags
                & {
                    "product_close",
                    "packaging",
                    "lumos_box",
                    "blinker_light",
                    "blinker_remote",
                    "fold",
                    "folding",
                    "folding_hinge",
                    "helmet",
                    "helmet_hanging",
                    "helmet_packaging",
                    "signals",
                    "firefly",
                    "battery",
                    "onewheel",
                    "fat_tire",
                }
            )
            headless = (not allow_face) and (not product_priority)

            seg = td / f"seg_{i:02d}.mp4"
            start = 0.4 if probe_duration(chosen) > 3 else 0.0
            if "fold" in tags or "folding" in tags:
                start = min(8.0, max(0.5, probe_duration(chosen) * 0.25))
            if "blinker_light" in tags or "led_glow" in tags:
                start = min(1.5, max(0.2, probe_duration(chosen) * 0.2))
            if "blinker_remote" in tags:
                start = 0.3
            top_bias = "helmet_hanging" in tags
            seg_budget = min(max_d, max(0.8, target_sec - t_cursor))
            if top_bias:
                start = min(3.0, max(2.0, start))
                used_dur = _vertical_segment_topbias(
                    chosen, seg, max_sec=seg_budget, start=start
                )
            else:
                used_dur = make_vertical_segment(
                    chosen,
                    seg,
                    max_sec=seg_budget,
                    start=start,
                    punch=(i == 0),
                    headless=headless,
                )
            # Hard enforce hook ≤2s / beat ≤3s after encode
            hard_cap = HOOK_MAX_SEC if i == 0 else BEAT_MAX_SEC
            if used_dur > hard_cap + 0.05:
                trimmed = td / f"seg_{i:02d}_t.mp4"
                run(
                    [
                        "ffmpeg", "-y", "-i", str(seg),
                        "-t", f"{hard_cap:.2f}", "-c", "copy", str(trimmed),
                    ]
                )
                seg = trimmed
                used_dur = probe_duration(seg)

            # Extract original audio for this window (if present)
            aseg = td / f"aseg_{i:02d}.aac"
            run(
                [
                    "ffmpeg", "-y", "-ss", str(start), "-t", f"{used_dur:.2f}",
                    "-i", str(chosen),
                    "-vn", "-ac", "2", "-ar", "44100",
                    "-c:a", "aac", "-b:a", "128k",
                    str(aseg),
                ],
                check=False,
            )
            if not aseg.exists() or aseg.stat().st_size < 200:
                run(
                    [
                        "ffmpeg", "-y", "-f", "lavfi",
                        "-i", f"anullsrc=r=44100:cl=stereo",
                        "-t", f"{used_dur:.2f}",
                        "-c:a", "aac", "-b:a", "96k", str(aseg),
                    ]
                )

            # Fit VO into segment length (pad or trim)
            vo_fit = td / f"vo_fit_{i:02d}.wav"
            vd = vo_durs[i]
            if vd <= used_dur:
                pad = used_dur - vd
                run(
                    [
                        "ffmpeg", "-y", "-i", str(vo_wavs[i]),
                        "-af", f"apad=pad_dur={pad:.3f}",
                        "-t", f"{used_dur:.3f}",
                        str(vo_fit),
                    ]
                )
            else:
                run(
                    [
                        "ffmpeg", "-y", "-i", str(vo_wavs[i]),
                        "-t", f"{used_dur:.3f}", str(vo_fit),
                    ]
                )
            vo_wavs[i] = vo_fit

            segs.append(seg)
            audio_segs.append(aseg)
            entry = {
                "i": i,
                "label": label,
                "phase": phase,
                "caption": cap,
                "vo": vo_lines[i],
                "keywords": kws,
                "need": need,
                "clip": chosen.name,
                "clip_path": str(chosen),
                "match_score": round(float(sc), 3) if sc is not None else 0.0,
                "motion": round(motion_map.get(chosen.name, 0.0), 3),
                "tags": sorted(tags),
                "t0": round(t_cursor, 2),
                "t1": round(t_cursor + used_dur, 2),
                "dur": round(used_dur, 2),
                "max_sec": round(max_d, 2),
                "headless": headless,
            }
            timeline.append(entry)
            t_cursor += used_dur

        # Validate viral pacing
        if timeline[0]["dur"] > HOOK_MAX_SEC + 0.08:
            raise RuntimeError(
                f"V5 hook too long: {timeline[0]['dur']}s > {HOOK_MAX_SEC}s"
            )
        for e in timeline[1:]:
            if e["dur"] > BEAT_MAX_SEC + 0.08:
                raise RuntimeError(
                    f"V5 beat '{e['label']}' too long: {e['dur']}s > {BEAT_MAX_SEC}s"
                )

        concat_list = td / "list.txt"
        concat_list.write_text(
            "".join(f"file '{s.resolve()}'\n" for s in segs), encoding="utf-8"
        )
        silent = td / "silent.mp4"
        run(
            [
                "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                "-i", str(concat_list), "-c", "copy", str(silent),
            ]
        )
        total = probe_duration(silent)
        if total > 59.5:
            trimmed = td / "silent_trim.mp4"
            run(
                [
                    "ffmpeg", "-y", "-i", str(silent), "-t", "45.0",
                    "-c", "copy", str(trimmed),
                ]
            )
            silent = trimmed
            total = probe_duration(silent)

        # Align caption times
        srt_lines: list[tuple[float, float, str]] = []
        for entry, cap in zip(timeline, captions):
            a = entry["t0"]
            b = min(total - 0.05, entry["t1"])
            if b <= a:
                continue
            entry["t0"] = a
            entry["t1"] = b
            srt_lines.append((a, b, cap))

        srt = SUBS / (out_path.stem + ".srt")
        write_srt(srt, srt_lines)
        lint_srt_file(srt, lang)

        # Concat original SFX + VO tracks
        with_audio = td / "with_audio.mp4"
        aconcat = td / "alist.txt"
        aconcat.write_text(
            "".join(f"file '{a.resolve()}'\n" for a in audio_segs), encoding="utf-8"
        )
        orig_audio = td / "orig.m4a"
        run(
            [
                "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                "-i", str(aconcat), "-c", "copy", str(orig_audio),
            ],
            check=False,
        )
        voconcat = td / "volist.txt"
        voconcat.write_text(
            "".join(f"file '{a.resolve()}'\n" for a in vo_wavs), encoding="utf-8"
        )
        vo_audio = td / "vo_all.wav"
        run(
            [
                "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                "-i", str(voconcat), "-c", "pcm_s16le", str(vo_audio),
            ]
        )

        # Mix: VO (lead) + ducked music + original ride SFX
        if music.exists() and orig_audio.exists():
            run(
                [
                    "ffmpeg", "-y",
                    "-i", str(silent),
                    "-i", str(orig_audio),
                    "-i", str(vo_audio),
                    "-stream_loop", "-1", "-i", str(music),
                    "-filter_complex",
                    (
                        f"[1:a]volume={ORIG_SOUND_VOL},aformat=sample_rates=44100:channel_layouts=stereo[sfx];"
                        f"[2:a]volume={VO_VOL},aformat=sample_rates=44100:channel_layouts=stereo[narr];"
                        f"[3:a]volume={MUSIC_BASE_VOL},"
                        f"afade=t=in:d=0.25,afade=t=out:st={max(0, total - 1.2)}:d=1.2,"
                        f"aformat=sample_rates=44100:channel_layouts=stereo[bg];"
                        f"[bg][narr]sidechaincompress=threshold=0.02:ratio=8:attack=5:release=180:level_sc=1[ducked];"
                        f"[sfx][narr][ducked]amix=inputs=3:duration=first:dropout_transition=0:weights=0.7 1.2 0.55[a]"
                    ),
                    "-map", "0:v", "-map", "[a]",
                    "-t", str(total),
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-shortest", str(with_audio),
                ],
                check=False,
            )
        if not with_audio.exists() and music.exists():
            run(
                [
                    "ffmpeg", "-y",
                    "-i", str(silent),
                    "-i", str(vo_audio),
                    "-stream_loop", "-1", "-i", str(music),
                    "-filter_complex",
                    (
                        f"[1:a]volume={VO_VOL}[narr];"
                        f"[2:a]volume={MUSIC_DUCK_VOL},afade=t=in:d=0.3,"
                        f"afade=t=out:st={max(0, total - 1.4)}:d=1.4[bg];"
                        f"[bg][narr]sidechaincompress=threshold=0.02:ratio=8:attack=5:release=180[ducked];"
                        f"[narr][ducked]amix=inputs=2:duration=first[a]"
                    ),
                    "-map", "0:v", "-map", "[a]",
                    "-t", str(total),
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
                    "-shortest", str(with_audio),
                ],
                check=False,
            )
        if not with_audio.exists():
            run(
                [
                    "ffmpeg", "-y",
                    "-i", str(silent),
                    "-i", str(vo_audio),
                    "-filter_complex", f"[1:a]volume={VO_VOL}[a]",
                    "-map", "0:v", "-map", "[a]",
                    "-c:v", "copy", "-c:a", "aac",
                    "-t", str(total), str(with_audio),
                ]
            )

        # Persist VO script next to output
        vo_txt = OUT / (out_path.stem + "_vo.txt")
        vo_txt.write_text(
            "\n".join(f"{i+1}. {ln}" for i, ln in enumerate(vo_lines)) + "\n",
            encoding="utf-8",
        )

        burn_captions_v5(with_audio, srt, out_path, keywords)
        (OUT / (out_path.stem + ".srt")).write_text(
            srt.read_text(encoding="utf-8"), encoding="utf-8"
        )

        final_face = face_score(out_path, samples=6) if not allow_face else 0.0
        if not allow_face and final_face > max_face:
            raise RuntimeError(
                f"faceless QA failed for {out_path.name}: face_score={final_face:.3f}"
            )

        evidence_paths = []
        if evidence_dir is not None:
            evidence_dir.mkdir(parents=True, exist_ok=True)
            for entry in timeline:
                mid = (entry["t0"] + entry["t1"]) / 2
                safe_cap = re.sub(r"[^\w\-]+", "_", entry["caption"])[:40]
                dst = (
                    evidence_dir
                    / f"{out_path.stem}_{entry['i']:02d}_{entry['phase']}_{entry['label']}_{safe_cap}.jpg"
                )
                run(
                    [
                        "ffmpeg", "-y", "-ss", f"{mid:.2f}", "-i", str(out_path),
                        "-frames:v", "1", "-q:v", "2", str(dst),
                    ],
                    check=False,
                )
                if dst.exists():
                    img = cv2.imread(str(dst))
                    if img is not None:
                        h, w = img.shape[:2]
                        bar_h = 90
                        overlay = img.copy()
                        cv2.rectangle(overlay, (0, h - bar_h), (w, h), (0, 0, 0), -1)
                        img = cv2.addWeighted(overlay, 0.55, img, 0.45, 0)
                        label = f"[{entry['phase']}] {entry['caption'][:42]}"
                        cv2.putText(
                            img, label, (18, h - 36),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2,
                            cv2.LINE_AA,
                        )
                        cv2.imwrite(str(dst), img)
                    evidence_paths.append(str(dst))
                    entry["evidence"] = str(dst)

        meta = {
            "path": str(out_path),
            "version": "v5",
            "playbook": "STOP→CURIOSITY→ESCALATION→PAYOFF→LOOP",
            "duration": round(probe_duration(out_path), 2),
            "lang": lang,
            "project": project,
            "music": str(music),
            "music_name": music.name,
            "music_base_vol": MUSIC_BASE_VOL,
            "music_duck": True,
            "prefer_original_sound": prefer_original_sound,
            "vo": vo_lines,
            "vo_has_info": vo_has_info(vo_lines),
            "vo_voice": VOICES["de" if lang.startswith("de") else "en"],
            "faceless": not allow_face,
            "face_score": round(final_face, 4),
            "font_size": CAPTION_FONT_SIZE,
            "font_pct_nominal": round(
                100.0 * CAPTION_FONT_SIZE / CAPTION_PLAY_RES_Y, 2
            ),
            "hook_max_sec": HOOK_MAX_SEC,
            "beat_max_sec": BEAT_MAX_SEC,
            "max_segment_dur": max(e["dur"] for e in timeline) if timeline else 0,
            "structure_warnings": struct_warns,
            "timeline": timeline,
            "catalog": catalog,
            "evidence": evidence_paths,
            "hook": captions[0],
            "cta": story["cta"],
            "loop": story.get("loop"),
        }
        (OUT / (out_path.stem + ".meta.json")).write_text(
            json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print(
            f"Built v5 {out_path} ({meta['duration']:.1f}s) lang={lang} "
            f"music={music.name} face={final_face:.3f} beats={len(timeline)} "
            f"hook={timeline[0]['dur']:.2f}s"
        )
        return meta


if __name__ == "__main__":
    print("build_short_v5 module — use rebuild_pilots_v5.py")
