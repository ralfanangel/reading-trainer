#!/usr/bin/env python3
"""EMOBILIST Shorts V5 — viral structure enforcer.

STOP → CURIOSITY → ESCALATION → PAYOFF → LOOP

Enforces:
- Hook visual ≤2.0s
- Beat visual changes ≤3.0s
- V4 visual_plan beat→clip matching (unchanged hard rule)
- ASS captions FontSize=56 + keyword highlight (color/bold, no size bloat)
- Music variance + ducking; prefer mix with original clip audio
- Structure phase markers in timeline meta
"""
from __future__ import annotations

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

HOOK_MAX_SEC = 2.0
BEAT_MAX_SEC = 3.0
MUSIC_BASE_VOL = 0.10
MUSIC_DUCK_VOL = 0.05
ORIG_SOUND_VOL = 0.55
# ASS keyword highlight: cyan-ish BGR as &HAABBGGRR (ASS uses AABBGGRR)
KEYWORD_COLOR = "00E5FF"  # yellow-cyan highlight on white


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


def _normalize_story(story: dict) -> tuple[list[str], list[dict], list[list[str]], list[dict]]:
    """Expand hook/beats/cta/loop into caption list + structure + keywords + visual_plan."""
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
    return captions, structure, keywords, visual_plan


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

    captions, structure, keywords, plan = _normalize_story(story)
    assert_cta(story["cta"], lang)
    assert_language(captions, lang)
    struct_warns = lint_structure(structure)
    if struct_warns:
        print("structure warnings:", struct_warns)

    clips = list(clip_paths)
    if not clips:
        raise RuntimeError("no clips")
    catalog = {c.name: sorted(tags_for_clip(project, c)) for c in clips}

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

        for i, (cap, vp, st, kws, max_d) in enumerate(
            zip(captions, plan, structure, keywords, max_durs)
        ):
            need = list(vp.get("need") or [])
            avoid = list(vp.get("avoid") or [])
            label = vp.get("label") or st.get("label") or f"beat{i}"
            phase = st.get("phase") or "ESCALATION"

            chosen, sc, tags = pick_clip_for_beat(
                clips, project, need, used, avoid=avoid
            )
            if chosen is None or sc < 0.34:
                for loose in (
                    [need[:1]] if need else [],
                    [["product"], ["product_close"], ["workshop"], ["ride"]],
                ):
                    chosen, sc, tags = pick_clip_for_beat(
                        clips, project, loose, used, avoid=avoid
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
                # silent filler
                run(
                    [
                        "ffmpeg", "-y", "-f", "lavfi",
                        "-i", f"anullsrc=r=44100:cl=stereo",
                        "-t", f"{used_dur:.2f}",
                        "-c:a", "aac", "-b:a", "96k", str(aseg),
                    ]
                )

            segs.append(seg)
            audio_segs.append(aseg)
            entry = {
                "i": i,
                "label": label,
                "phase": phase,
                "caption": cap,
                "keywords": kws,
                "need": need,
                "clip": chosen.name,
                "clip_path": str(chosen),
                "match_score": round(sc, 3),
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

        # Mix: original sound + ducked music
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
        if music.exists() and prefer_original_sound and orig_audio.exists():
            # Duck music under louder original (sidechain-ish approx via dual volumes)
            run(
                [
                    "ffmpeg", "-y",
                    "-i", str(silent),
                    "-i", str(orig_audio),
                    "-stream_loop", "-1", "-i", str(music),
                    "-filter_complex",
                    (
                        f"[1:a]volume={ORIG_SOUND_VOL},aformat=sample_rates=44100:channel_layouts=stereo[vo];"
                        f"[2:a]volume={MUSIC_BASE_VOL},"
                        f"afade=t=in:d=0.25,afade=t=out:st={max(0, total - 1.2)}:d=1.2,"
                        f"aformat=sample_rates=44100:channel_layouts=stereo[bg];"
                        # Further duck bed when original has energy (approx sidechain)
                        f"[bg][vo]sidechaincompress=threshold=0.05:ratio=6:attack=20:release=250:level_sc=1[ducked];"
                        f"[vo][ducked]amix=inputs=2:duration=first:dropout_transition=0[a]"
                    ),
                    "-map", "0:v", "-map", "[a]",
                    "-t", str(total),
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
                    "-shortest", str(with_audio),
                ],
                check=False,
            )
        if not with_audio.exists() and music.exists():
            run(
                [
                    "ffmpeg", "-y",
                    "-i", str(silent),
                    "-stream_loop", "-1", "-i", str(music),
                    "-filter_complex",
                    f"[1:a]volume={MUSIC_DUCK_VOL},afade=t=in:d=0.3,"
                    f"afade=t=out:st={max(0, total - 1.4)}:d=1.4[a]",
                    "-map", "0:v", "-map", "[a]",
                    "-t", str(total),
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
                    "-shortest", str(with_audio),
                ]
            )
        if not with_audio.exists():
            run(
                [
                    "ffmpeg", "-y", "-i", str(silent),
                    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
                    "-c:v", "copy", "-c:a", "aac", "-shortest",
                    "-t", str(total), str(with_audio),
                ]
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
            "faceless": not allow_face,
            "face_score": round(final_face, 4),
            "font_size": CAPTION_FONT_SIZE,
            "font_pct_nominal": round(
                100.0 * CAPTION_FONT_SIZE / CAPTION_PLAY_RES_Y, 2
            ),
            "hook_max_sec": HOOK_MAX_SEC,
            "beat_max_sec": BEAT_MAX_SEC,
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
