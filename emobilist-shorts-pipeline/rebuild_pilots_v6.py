#!/usr/bin/env python3
"""V6 pilot rebuild — one demo first, then batch when approved."""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))

# Backward-compat: symlink data → /tmp/shorts_pipeline for v4/v5 ROOT paths
import pipeline_config as pc

pc.ensure_dirs()
TMP_ROOT = Path("/tmp/shorts_pipeline")
if not TMP_ROOT.exists():
    TMP_ROOT.symlink_to(pc.DATA_ROOT)

# Copy static assets into data dir
for name in [
    "v5_action_scene_scores.json",
    "v5_motion_bonus_tags.json",
    "v6_story_templates.json",
]:
    src = PIPELINE / name
    if src.exists():
        shutil.copy2(src, pc.DATA_ROOT / name)

from build_short_v2 import probe_duration
from build_short_v5 import MOTION_SCORES, MOTION_BONUS
from build_short_v6 import build_short_v6
from pipeline_config import ARTIFACTS, MUSIC_DIR, OUT_V6

MOTION_SCORES.write_text((PIPELINE / "v5_action_scene_scores.json").read_text())
MOTION_BONUS.write_text((PIPELINE / "v5_motion_bonus_tags.json").read_text())

TEMPLATES = pc.DATA_ROOT / "v6_story_templates.json"
if not TEMPLATES.exists():
    from generate_v6_templates import main as gen_templates
    gen_templates()

LOCAL_RAW_MAP = pc.LOCAL_RAW_MAP


def clips_for(raw_key: str, project: str):
    from build_short_v4 import CURATED, tags_for_clip

    d = LOCAL_RAW_MAP.get(raw_key)
    if not d or not d.exists():
        return []
    all_clips = [
        p for p in sorted(d.iterdir())
        if p.suffix.lower() in {".mov", ".mp4", ".m4v"} and p.stat().st_size >= 5_000_000
    ]
    curated = set((CURATED.get(project) or {}).keys())
    preferred = [p for p in all_clips if p.stem in curated]
    other = [p for p in all_clips if p.stem not in curated]
    motion = {}
    scores = pc.DATA_ROOT / "v5_action_scene_scores.json"
    if scores.exists():
        data = json.loads(scores.read_text(encoding="utf-8"))
        for row in data.get(project) or []:
            motion[row["clip"]] = float(row.get("motion") or 0)
    preferred.sort(key=lambda p: motion.get(p.name, 0), reverse=True)
    return preferred + other[:8]


def music_for(cfg: dict) -> Path:
    key = cfg.get("music_key") or "bed_chill_depth.mp3"
    p = MUSIC_DIR / key
    if p.exists():
        return p
    for alt in sorted(MUSIC_DIR.glob("*.mp3")):
        return alt
    raise RuntimeError(f"No music in {MUSIC_DIR} — run setup_nas.py first")


def build_one(sid: str, upload: bool = False) -> dict:
    themes = json.loads(TEMPLATES.read_text(encoding="utf-8"))["themes"]
    cfg = themes[sid]
    music = music_for(cfg)
    clips = clips_for(cfg["raw"], cfg["project"])
    if len(clips) < 3:
        raise RuntimeError(f"{sid}: only {len(clips)} clips — run setup_nas.py")

    out = OUT_V6 / f"{sid}_v6.mp4"
    story = {**cfg["story"], "vo_script": cfg.get("vo_script")}
    meta = build_short_v6(
        clips, story, out,
        lang=cfg["lang"], project=cfg["project"], music=music,
    )

    q = meta["quality"]
    print(f"\n{sid} quality: {q['score']}/10 ({q['grade']})")
    if q["blockers"]:
        print("  Blockers:", "; ".join(q["blockers"]))

    if upload and q["pass_upload"]:
        from upload_short import upload_short
        try:
            from youtube_delete_safety import register_agent_upload
        except ImportError:
            register_agent_upload = lambda *a, **k: None

        desc = (
            f"{cfg['title']}\n\n#Shorts #EMobility\n"
            f"{'@the.emobilist' if cfg['lang']=='de' else '@emobilistusa'}\n"
            f"V6 — unlisted for review (score {q['score']}/10)"
        )
        up = upload_short(
            cfg["channel"], str(out), cfg["title"][:100], desc,
            cfg["tags"], publish_at=None, privacy_status="unlisted",
        )
        vid = up.get("id")
        register_agent_upload(vid, channel=cfg["channel"], story_id=sid, title=cfg["title"], version="v6")
        meta["videoId"] = vid
        meta["url"] = f"https://youtu.be/{vid}"
        print(f"  uploaded unlisted: {meta['url']}")

    result_path = ARTIFACTS / f"pilot_{sid}_v6.json"
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    result_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    return meta


def main():
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--id", default="DE-01", help="Theme ID (e.g. DE-01)")
    ap.add_argument("--all", action="store_true", help="Build all 12")
    ap.add_argument("--upload", action="store_true", help="Upload if quality ≥7")
    args = ap.parse_args()

    if args.all:
        themes = json.loads(TEMPLATES.read_text(encoding="utf-8"))["themes"]
        results, errors = [], []
        for sid in themes:
            try:
                results.append(build_one(sid, upload=args.upload))
            except Exception as e:
                errors.append({"id": sid, "error": str(e)})
                print(f"ERROR {sid}: {e}")
        summary = {"built": len(results), "errors": errors}
        (ARTIFACTS / "pilot_uploads_v6_summary.json").write_text(
            json.dumps(summary, indent=2), encoding="utf-8"
        )
        if errors:
            sys.exit(1)
    else:
        build_one(args.id, upload=args.upload)


if __name__ == "__main__":
    main()
