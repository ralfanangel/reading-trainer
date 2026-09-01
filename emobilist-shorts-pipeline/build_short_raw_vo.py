#!/usr/bin/env python3
"""Build Short from real Ralf VO sentence clips + matching B-roll + music."""
from __future__ import annotations

import json
import re
import tempfile
from pathlib import Path

from build_short_v2 import (
    CAPTION_FONT_SIZE,
    assert_cta,
    assert_language,
    make_vertical_segment,
    probe_duration,
    run,
)
from build_short_v5 import (
    HOOK_MAX_SEC,
    BEAT_MAX_SEC,
    _normalize_story,
    load_motion_map,
    pick_clip_for_beat_v5,
)
from build_short_v6 import _ensure_whoosh
from karaoke_captions import burn_karaoke
from pipeline_config import DATA_ROOT, MUSIC_DIR, OUT_V6
from ralf_vo_bank import match_sentence

OUT_RAW = DATA_ROOT / "out_raw_vo"
VO_SEGS = DATA_ROOT / "vo_segments"

PROJECT_MAP = {
    "onewheel": "241217_OneWheel",
    "ohlala": "250906_Ohlala Kids Dirt Bike",
    "tst": "250413_TST_002 Fatbike",
    "vitilan": "250322_VitilanV3",
    "invanti": "250513_Invanti_Tide2",
    "lumos": "250103_LUMOS_Hemlet",
}

LOCAL_RAW = {
    "241217_OneWheel": DATA_ROOT / "raw" / "pilot_onewheel",
    "250906_Ohlala Kids Dirt Bike": DATA_ROOT / "raw" / "pilot_ohlala",
    "250413_TST_002 Fatbike": DATA_ROOT / "raw" / "pilot_tst",
    "250322_VitilanV3": DATA_ROOT / "raw" / "pilot_vitilan",
    "250513_Invanti_Tide2": DATA_ROOT / "raw" / "250513_Invanti_Tide2",
    "250103_LUMOS_Hemlet": DATA_ROOT / "raw" / "250103_LUMOS_Hemlet",
}


VO_BROLL_FALLBACK = {
    "250322_VitilanV3": DATA_ROOT / "raw" / "vo_candidates" / "vitilan",
    "250513_Invanti_Tide2": DATA_ROOT / "raw" / "vo_candidates" / "invanti",
    "250413_TST_002 Fatbike": DATA_ROOT / "raw" / "vo_candidates" / "tst",
    "250103_LUMOS_Hemlet": DATA_ROOT / "raw" / "vo_candidates" / "lumos",
}


def _clips_for_project(raw_key: str, project: str) -> list[Path]:
    from build_short_v4 import CURATED

    dirs = [LOCAL_RAW.get(raw_key), VO_BROLL_FALLBACK.get(raw_key)]
    all_clips: list[Path] = []
    seen: set[str] = set()
    for d in dirs:
        if not d or not d.exists():
            continue
        for p in sorted(d.iterdir()):
            if p.suffix.lower() not in {".mov", ".mp4", ".m4v"}:
                continue
            if p.stat().st_size < 500_000 or p.name in seen:
                continue
            seen.add(p.name)
            all_clips.append(p)
    curated = set((CURATED.get(project) or {}).keys())
    preferred = [p for p in all_clips if p.stem in curated]
    other = [p for p in all_clips if p.stem not in curated]
    return preferred + other[:16]


def _mix_audio_raw(
    video: Path,
    vo_wav: Path,
    orig_audio: Path | None,
    music: Path,
    sfx_times: list[float],
    whoosh: Path,
    out: Path,
    total: float,
) -> None:
    """Mix Ralf VO + ducked music + ride SFX + whoosh."""
    inputs = ["-i", str(video), "-i", str(vo_wav)]
    parts = [
        "[1:a]asplit=2[narr_main][narr_sc];",
        "[narr_main]volume=1.35,aformat=sample_rates=44100:channel_layouts=stereo[narr_out];",
    ]
    mix_inputs: list[str] = ["[narr_out]"]
    idx = 2

    if orig_audio and orig_audio.exists() and orig_audio.stat().st_size > 200:
        inputs += ["-i", str(orig_audio)]
        parts.append(
            f"[{idx}:a]volume=0.25,aformat=sample_rates=44100:channel_layouts=stereo[sfx];"
        )
        mix_inputs.append("[sfx]")
        idx += 1

    if music.exists():
        inputs += ["-stream_loop", "-1", "-i", str(music)]
        parts.append(
            f"[{idx}:a]volume=0.14,"
            f"afade=t=in:d=0.2,afade=t=out:st={max(0, total - 1.0)}:d=1.0,"
            f"aformat=sample_rates=44100:channel_layouts=stereo[bg];"
            f"[bg][narr_sc]sidechaincompress=threshold=0.03:ratio=6:attack=5:release=250[ducked];"
        )
        mix_inputs.append("[ducked]")
        idx += 1

    if sfx_times and whoosh.exists():
        for _ in sfx_times[:7]:
            inputs += ["-i", str(whoosh)]
        for j, t in enumerate(sfx_times[:7]):
            si = idx + j
            parts.append(
                f"[{si}:a]adelay={int(t * 1000)}|{int(t * 1000)},volume=0.3[w{j}];"
            )
            mix_inputs.append(f"[w{j}]")

    parts.append(
        f"{''.join(mix_inputs)}amix=inputs={len(mix_inputs)}:"
        f"duration=first:dropout_transition=0:normalize=0[mix];"
        f"[mix]loudnorm=I=-14:TP=-1.5:LRA=11:linear=true[ln];"
        f"[ln]aformat=sample_rates=44100:channel_layouts=stereo,alimiter=limit=0.95[a]"
    )
    run(
        [
            "ffmpeg", "-y", *inputs,
            "-filter_complex", "".join(parts),
            "-map", "0:v", "-map", "[a]",
            "-t", str(total),
            "-c:v", "copy", "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "192k",
            str(out),
        ]
    )


def extract_vo_segment(seg: dict, out_wav: Path, max_sec: float | None = None) -> float:
    """Cut one sentence WAV from source clip."""
    VO_SEGS.mkdir(parents=True, exist_ok=True)
    src = Path(seg["clip_path"])
    if not src.exists():
        raise FileNotFoundError(src)
    pad = 0.05
    start = max(0, seg["start"] - pad)
    dur = seg["end"] - seg["start"] + 2 * pad
    if max_sec and max_sec > 0:
        dur = min(dur, max_sec)
    run(
        [
            "ffmpeg", "-y", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}",
            "-i", str(src), "-vn", "-ac", "2", "-ar", "44100",
            "-af", "highpass=f=100,compand=attacks=0.05:decays=0.2:points=-80/-80|-25/-12|0/-6",
            str(out_wav),
        ]
    )
    return probe_duration(out_wav)


def build_short_raw_vo(
    story_id: str,
    cfg: dict,
    bank: dict,
    out_path: Path,
    music: Path,
) -> dict:
    OUT_RAW.mkdir(parents=True, exist_ok=True)
    story = cfg["story"]
    lang = cfg["lang"]
    project = cfg["project"]
    raw_key = cfg["raw"]

    captions, structure, keywords, plan, _ = _normalize_story(story)
    assert_cta(story["cta"], lang)
    assert_language(captions, lang)

    broll = _clips_for_project(raw_key, project)
    if len(broll) < 3:
        raise RuntimeError(f"{story_id}: need B-roll clips for {raw_key}")

    motion_map = load_motion_map(project)
    whoosh = _ensure_whoosh()
    used_vo: set[str] = set()
    used_clip: set[str] = set()

    # Map VO project preference: vitilan/invanti/lumos/tst bank for matching themes
    vo_project = {
        "vitilan": "vitilan",
        "invanti": "invanti",
        "lumos": "lumos",
        "tst": "tst",
        "onewheel": "vitilan",  # fallback to general Ralf VO
        "ohlala": "vitilan",
    }.get(project, "vitilan")

    with tempfile.TemporaryDirectory(prefix="rawvo_") as td:
        td = Path(td)
        segs_v: list[Path] = []
        segs_a: list[Path] = []
        vo_parts: list[Path] = []
        timeline = []
        sfx_times: list[float] = []
        t_cursor = 0.0

        for i, (cap, vp, st, kws) in enumerate(zip(captions, plan, structure, keywords)):
            phase = st.get("phase") or "ESCALATION"
            max_d = float(st.get("max_sec") or BEAT_MAX_SEC)
            if i == 0:
                max_d = min(max_d, HOOK_MAX_SEC)

            # VO sentence
            vo_seg = match_sentence(cap, lang, bank, used_vo, project=vo_project)
            if vo_seg is None:
                vo_seg = match_sentence(cap, lang, bank, used_vo)
            if vo_seg is None:
                raise RuntimeError(f"{story_id}: no VO segment for beat '{cap}'")
            used_vo.add(vo_seg["id"])

            vo_wav = td / f"vo_{i:02d}.wav"
            vo_dur = extract_vo_segment(vo_seg, vo_wav, max_sec=max_d)
            beat_dur = min(max_d, max(1.0, vo_dur + 0.1), BEAT_MAX_SEC if i else HOOK_MAX_SEC)
            vo_parts.append(vo_wav)

            # B-roll visual (not the talking clip unless hook)
            need = list(vp.get("need") or [])
            avoid = list(vp.get("avoid") or [])
            # avoid same clip as VO source for variety
            avoid_stems = avoid + [Path(vo_seg["clip"]).stem]
            chosen, sc, tags = pick_clip_for_beat_v5(
                broll, project, need, used_clip, avoid=avoid_stems,
                prefer_motion=(phase in ("STOP", "CURIOSITY", "ESCALATION")),
                motion_map=motion_map,
            )
            if chosen is None:
                chosen, sc, tags = pick_clip_for_beat_v5(
                    broll, project, ["product", "ride"], used_clip,
                    prefer_motion=True, motion_map=motion_map,
                )
            if chosen is None:
                chosen = broll[i % len(broll)]
            used_clip.add(chosen.name)

            seg_v = td / f"v_{i:02d}.mp4"
            start = 0.3
            if "fold" in tags:
                start = min(5.0, probe_duration(chosen) * 0.2)
            make_vertical_segment(
                chosen, seg_v, max_sec=beat_dur, start=start,
                punch=(i == 0), headless=True,
            )
            actual = probe_duration(seg_v)

            aseg = td / f"a_{i:02d}.aac"
            run(
                [
                    "ffmpeg", "-y", "-ss", str(start), "-t", f"{actual:.2f}",
                    "-i", str(chosen), "-vn", "-ac", "2", "-ar", "44100",
                    "-c:a", "aac", "-b:a", "96k", str(aseg),
                ],
                check=False,
            )

            if i > 0:
                sfx_times.append(t_cursor)
            segs_v.append(seg_v)
            segs_a.append(aseg)
            timeline.append({
                "i": i, "phase": phase, "caption": cap,
                "vo_text": vo_seg["text"], "vo_clip": vo_seg["clip"],
                "vo_id": vo_seg["id"], "broll": chosen.name,
                "t0": round(t_cursor, 2), "dur": round(actual, 2),
                "match_score": round(float(sc or 0), 3),
            })
            t_cursor += actual

        # Concat video
        clist = td / "vlist.txt"
        clist.write_text("".join(f"file '{p.resolve()}'\n" for p in segs_v), encoding="utf-8")
        silent = td / "silent.mp4"
        run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(clist), "-c", "copy", str(silent)])
        total = probe_duration(silent)

        # Concat VO
        vlist = td / "volist.txt"
        vlist.write_text("".join(f"file '{p.resolve()}'\n" for p in vo_parts), encoding="utf-8")
        vo_all = td / "vo_all.wav"
        run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(vlist), "-c", "pcm_s16le", str(vo_all)])

        alist = td / "alist.txt"
        alist.write_text("".join(f"file '{a.resolve()}'\n" for a in segs_a), encoding="utf-8")
        orig = td / "orig.m4a"
        run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(alist), "-c", "copy", str(orig)], check=False)

        with_audio = td / "mixed.mp4"
        _mix_audio_raw(silent, vo_all, orig, music, sfx_times, whoosh, with_audio, total)

        all_kws = [kw for kws in keywords for kw in (kws or [])]
        burn_karaoke(with_audio, vo_all, out_path, "en", keywords=all_kws)

        meta = {
            "path": str(out_path),
            "version": "raw_vo",
            "story_id": story_id,
            "duration": round(probe_duration(out_path), 2),
            "lang": lang,
            "vo_engine": "ralf_raw",
            "karaoke": True,
            "sfx_on_cuts": True,
            "timeline": timeline,
            "title": cfg["title"],
        }
        (out_path.with_suffix(".meta.json")).write_text(
            json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print(f"Built raw_vo {out_path} ({meta['duration']:.1f}s) beats={len(timeline)}")
        return meta
