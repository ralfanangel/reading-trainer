#!/usr/bin/env python3
"""EMOBILIST Shorts V6 — viral quality upgrade.

Key improvements over V5 (3/10 → target 8/10):
- Continuous narration (one flowing script, not 13 choppy lines)
- Word-by-word karaoke captions (faster-whisper)
- Cuts every ≤2.5s with zoom punch + SFX
- ElevenLabs Ralf voice when API key present
- Shorter runtime (28-35s, 7-8 beats)
- Automated quality gate (score ≥7 before upload)
"""
from __future__ import annotations

import json
import re
import tempfile
from pathlib import Path

from build_short_v2 import (
    CAPTION_FONT_SIZE,
    assert_cta,
    assert_language,
    face_score,
    make_vertical_segment,
    probe_duration,
    run,
)
from build_short_v4 import pick_clip_for_beat, tags_for_clip
from build_short_v5 import (
    HOOK_MAX_SEC,
    _normalize_story,
    lint_structure,
    load_motion_map,
    pick_clip_for_beat_v5,
    vo_has_info,
)
from karaoke_captions import burn_karaoke
from pipeline_config import OUT_V6, SFX_DIR, SUBS_V6, VO_V6, ensure_dirs
from quality_gate import score_short
from voice_v6 import synthesize_narration

BEAT_MAX_SEC = 2.5
TARGET_SEC = 32.0
MUSIC_BASE_VOL = 0.07
ORIG_SOUND_VOL = 0.5
VO_VOL = 1.1
SFX_VOL = 0.35


def _ensure_whoosh() -> Path:
    """Fallback whoosh SFX if NAS FX not downloaded."""
    SFX_DIR.mkdir(parents=True, exist_ok=True)
    p = SFX_DIR / "whoosh_short.wav"
    if p.exists():
        return p
    run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "sine=frequency=800:duration=0.08",
            "-f", "lavfi", "-i", "sine=frequency=200:duration=0.12",
            "-filter_complex",
            "[0:a][1:a]concat=n=2:v=0:a=1,afade=t=out:st=0.1:d=0.1,volume=0.4[a]",
            "-map", "[a]", "-ar", "44100", "-ac", "2",
            str(p),
        ],
        check=False,
    )
    return p


def _make_segment_v6(
    src: Path,
    dst: Path,
    max_sec: float,
    start: float = 0.0,
    punch: bool = True,
    headless: bool = False,
) -> float:
    """Vertical segment with mandatory zoom punch on hook beats."""
    if headless:
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
            + "zoompan=z='if(eq(on,1),1.08,min(1.15,1+0.004*on))':d=1:"
            "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,"
            "eq=contrast=1.08:saturation=1.05,"
            "format=yuv420p"
        )
    else:
        vf = base + "eq=contrast=1.05:saturation=1.03,fps=30,format=yuv420p"
    dur = min(max_sec, max(0.7, probe_duration(src) - start))
    run(
        [
            "ffmpeg", "-y", "-ss", str(start), "-t", str(dur),
            "-i", str(src), "-vf", vf, "-an",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
            str(dst),
        ]
    )
    return probe_duration(dst)


def _mix_audio(
    video: Path,
    vo_wav: Path,
    orig_audio: Path | None,
    music: Path,
    sfx_times: list[float],
    whoosh: Path,
    out: Path,
    total: float,
) -> None:
    """Mix VO + ducked music + original ride SFX + whoosh on cuts."""
    inputs = ["-i", str(video), "-i", str(vo_wav)]
    filt_parts = [
        f"[1:a]volume={VO_VOL},aformat=sample_rates=44100:channel_layouts=stereo[narr];",
    ]
    mix_inputs = ["[narr]"]
    idx = 2

    if orig_audio and orig_audio.exists() and orig_audio.stat().st_size > 200:
        inputs += ["-i", str(orig_audio)]
        filt_parts.append(
            f"[{idx}:a]volume={ORIG_SOUND_VOL},aformat=sample_rates=44100:channel_layouts=stereo[sfx];"
        )
        mix_inputs.append("[sfx]")
        idx += 1

    if music.exists():
        inputs += ["-stream_loop", "-1", "-i", str(music)]
        filt_parts.append(
            f"[{idx}:a]volume={MUSIC_BASE_VOL},"
            f"afade=t=in:d=0.2,afade=t=out:st={max(0, total - 1.0)}:d=1.0,"
            f"aformat=sample_rates=44100:channel_layouts=stereo[bg];"
            f"[bg][narr]sidechaincompress=threshold=0.015:ratio=10:attack=3:release=200[ducked];"
        )
        mix_inputs.append("[ducked]")
        idx += 1

    # Whoosh SFX at cut points
    if sfx_times and whoosh.exists():
        for t in sfx_times[:8]:
            inputs += ["-i", str(whoosh)]
        for j, t in enumerate(sfx_times[:8]):
            si = idx + j
            filt_parts.append(
                f"[{si}:a]adelay={int(t*1000)}|{int(t*1000)},volume={SFX_VOL}[w{j}];"
            )
            mix_inputs.append(f"[w{j}]")

    n = len(mix_inputs)
    weights = " ".join(["1.2"] + ["0.6"] * (n - 1))
    filt_parts.append(
        f"{''.join(mix_inputs)}amix=inputs={n}:duration=first:dropout_transition=0:weights={weights}[a]"
    )
    run(
        [
            "ffmpeg", "-y", *inputs,
            "-filter_complex", "".join(filt_parts),
            "-map", "0:v", "-map", "[a]",
            "-t", str(total),
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            str(out),
        ],
        check=False,
    )


def build_short_v6(
    clip_paths: list[Path],
    story: dict,
    out_path: Path,
    lang: str,
    project: str,
    music: Path,
    target_sec: float = TARGET_SEC,
    allow_face: bool = False,
    max_face: float = 0.55,
) -> dict:
    ensure_dirs()
    OUT_V6.mkdir(parents=True, exist_ok=True)

    captions, structure, keywords, plan, vo_lines = _normalize_story(story)
    assert_cta(story["cta"], lang)
    assert_language(captions, lang)

    # V6: use continuous script if provided
    vo_script = story.get("vo_script") or " ".join(vo_lines)
    all_keywords = [kw for kws in keywords for kw in (kws or [])]

    clips = list(clip_paths)
    if not clips:
        raise RuntimeError("no clips")
    motion_map = load_motion_map(project)
    whoosh = _ensure_whoosh()

    with tempfile.TemporaryDirectory(prefix="shortv6_") as td:
        td = Path(td)

        # --- Phase 1: Build visual timeline (≤2.5s beats) ---
        n = len(captions)
        max_durs = []
        for i, st in enumerate(structure):
            mx = float(st.get("max_sec") or BEAT_MAX_SEC)
            if i == 0:
                mx = min(mx, HOOK_MAX_SEC)
            else:
                mx = min(mx, BEAT_MAX_SEC)
            max_durs.append(mx)

        if sum(max_durs) > target_sec:
            scale = target_sec / sum(max_durs)
            max_durs = [
                min(HOOK_MAX_SEC if i == 0 else BEAT_MAX_SEC, max(1.0, d * scale))
                for i, d in enumerate(max_durs)
            ]

        segs: list[Path] = []
        audio_segs: list[Path] = []
        timeline: list[dict] = []
        used: set[str] = set()
        t_cursor = 0.0
        sfx_times: list[float] = []

        for i, (cap, vp, st, kws) in enumerate(zip(captions, plan, structure, keywords)):
            need = list(vp.get("need") or [])
            avoid = list(vp.get("avoid") or [])
            phase = st.get("phase") or "ESCALATION"
            label = vp.get("label") or f"beat{i}"
            max_d = max_durs[i]

            prefer_motion = phase in ("STOP", "CURIOSITY", "ESCALATION")
            chosen, sc, tags = pick_clip_for_beat_v5(
                clips, project, need, used, avoid=avoid,
                prefer_motion=prefer_motion, motion_map=motion_map,
            )
            if chosen is None or (isinstance(sc, float) and sc < 0.34):
                for loose in ([need[:1]] if need else [], [["product"], ["ride"], ["workshop"]]):
                    if not loose:
                        continue
                    chosen, sc, tags = pick_clip_for_beat_v5(
                        clips, project, loose[0], used, avoid=avoid,
                        prefer_motion=True, motion_map=motion_map,
                    )
                    if chosen and sc >= 0.34:
                        break
            if chosen is None:
                raise RuntimeError(f"No clip for beat '{cap}' need={need}")

            used.add(chosen.name)
            product_priority = bool(tags & {"product_close", "fold", "blinker_light", "helmet"})
            headless = (not allow_face) and (not product_priority)

            seg = td / f"seg_{i:02d}.mp4"
            start = 0.3 if probe_duration(chosen) > 2 else 0.0
            if "fold" in tags:
                start = min(6.0, probe_duration(chosen) * 0.2)
            seg_budget = min(max_d, max(0.7, target_sec - t_cursor))
            used_dur = _make_segment_v6(
                chosen, seg, max_sec=seg_budget, start=start,
                punch=(i == 0 or phase == "ESCALATION"),
                headless=headless,
            )
            hard_cap = HOOK_MAX_SEC if i == 0 else BEAT_MAX_SEC
            if used_dur > hard_cap + 0.05:
                trimmed = td / f"seg_{i:02d}_t.mp4"
                run(["ffmpeg", "-y", "-i", str(seg), "-t", f"{hard_cap:.2f}", "-c", "copy", str(trimmed)])
                seg = trimmed
                used_dur = probe_duration(seg)

            aseg = td / f"aseg_{i:02d}.aac"
            run(
                [
                    "ffmpeg", "-y", "-ss", str(start), "-t", f"{used_dur:.2f}",
                    "-i", str(chosen), "-vn", "-ac", "2", "-ar", "44100",
                    "-c:a", "aac", "-b:a", "128k", str(aseg),
                ],
                check=False,
            )

            if i > 0:
                sfx_times.append(t_cursor)
            segs.append(seg)
            audio_segs.append(aseg)
            timeline.append({
                "i": i, "label": label, "phase": phase, "caption": cap,
                "keywords": kws, "need": need, "clip": chosen.name,
                "match_score": round(float(sc or 0), 3),
                "motion": round(motion_map.get(chosen.name, 0.0), 3),
                "tags": sorted(tags), "t0": round(t_cursor, 2),
                "t1": round(t_cursor + used_dur, 2), "dur": round(used_dur, 2),
            })
            t_cursor += used_dur

        # Concat video
        clist = td / "list.txt"
        clist.write_text("".join(f"file '{s.resolve()}'\n" for s in segs), encoding="utf-8")
        silent = td / "silent.mp4"
        run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(clist), "-c", "copy", str(silent)])
        video_dur = probe_duration(silent)

        # --- Phase 2: Continuous VO ---
        vo_wav = VO_V6 / (out_path.stem + "_narr.wav")
        vo_wav, vo_engine = synthesize_narration(vo_script, lang, vo_wav)
        vo_dur = probe_duration(vo_wav)

        # Stretch video to match VO (or trim VO to video)
        final_dur = max(video_dur, min(vo_dur, target_sec + 4))
        if abs(vo_dur - video_dur) > 0.3:
            if vo_dur > video_dur:
                # Slow last segment slightly or pad
                final_dur = min(vo_dur, 42.0)
            else:
                final_dur = video_dur

        timed_video = td / "timed.mp4"
        run(
            [
                "ffmpeg", "-y", "-i", str(silent),
                "-filter:v", f"tpad=stop_mode=clone:stop_duration={max(0, final_dur - video_dur):.2f}",
                "-t", f"{final_dur:.2f}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                "-an", str(timed_video),
            ],
            check=False,
        )
        if not timed_video.exists() or probe_duration(timed_video) < 1:
            timed_video = silent
            final_dur = video_dur

        # Fit VO length
        vo_fit = td / "vo_fit.wav"
        run(
            [
                "ffmpeg", "-y", "-i", str(vo_wav),
                "-af", f"apad=pad_dur={max(0, final_dur - vo_dur):.2f}",
                "-t", f"{final_dur:.2f}", str(vo_fit),
            ]
        )

        # Concat original audio
        alist = td / "alist.txt"
        alist.write_text("".join(f"file '{a.resolve()}'\n" for a in audio_segs), encoding="utf-8")
        orig_audio = td / "orig.m4a"
        run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(alist), "-c", "copy", str(orig_audio)], check=False)

        # --- Phase 3: Audio mix ---
        with_audio = td / "with_audio.mp4"
        _mix_audio(timed_video, vo_fit, orig_audio, music, sfx_times, whoosh, with_audio, final_dur)
        if not with_audio.exists():
            run(
                [
                    "ffmpeg", "-y", "-i", str(timed_video), "-i", str(vo_fit),
                    "-filter_complex", f"[1:a]volume={VO_VOL}[a]",
                    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac",
                    "-t", f"{final_dur:.2f}", str(with_audio),
                ]
            )

        # --- Phase 4: Karaoke captions ---
        burn_karaoke(with_audio, vo_fit, out_path, lang, keywords=all_keywords)

        final_face = face_score(out_path, samples=6) if not allow_face else 0.0
        if not allow_face and final_face > max_face:
            raise RuntimeError(f"faceless QA failed: face_score={final_face:.3f}")

        meta = {
            "path": str(out_path),
            "version": "v6",
            "duration": round(probe_duration(out_path), 2),
            "lang": lang,
            "project": project,
            "music": str(music),
            "vo_script": vo_script,
            "vo_engine": vo_engine,
            "vo_has_info": vo_has_info([vo_script]),
            "karaoke": True,
            "sfx_on_cuts": bool(sfx_times),
            "hook_zoom": True,
            "font_size": CAPTION_FONT_SIZE,
            "hook_max_sec": HOOK_MAX_SEC,
            "beat_max_sec": BEAT_MAX_SEC,
            "max_segment_dur": max(e["dur"] for e in timeline) if timeline else 0,
            "timeline": timeline,
            "face_score": round(final_face, 4),
            "hook": captions[0],
            "cta": story["cta"],
            "loop": story.get("loop"),
        }
        meta["quality"] = score_short(meta)
        (OUT_V6 / (out_path.stem + ".meta.json")).write_text(
            json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print(
            f"Built v6 {out_path} ({meta['duration']:.1f}s) "
            f"score={meta['quality']['score']}/10 engine={vo_engine} "
            f"hook={timeline[0]['dur']:.2f}s"
        )
        return meta


if __name__ == "__main__":
    print("build_short_v6 — use rebuild_pilots_v6.py")
