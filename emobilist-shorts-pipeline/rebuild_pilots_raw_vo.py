#!/usr/bin/env python3
"""Build 10 pilot Shorts from real Ralf VO sentence clips + B-roll + music."""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))

import pipeline_config as pc

pc.ensure_dirs()
TMP_ROOT = Path("/tmp/shorts_pipeline")
if not TMP_ROOT.exists():
    TMP_ROOT.symlink_to(pc.DATA_ROOT)

for name in (
    "v5_action_scene_scores.json",
    "v5_motion_bonus_tags.json",
    "v6_story_templates.json",
):
    src = PIPELINE / name
    if src.exists():
        shutil.copy2(src, pc.DATA_ROOT / name)

from build_short_v5 import MOTION_BONUS, MOTION_SCORES
from build_short_raw_vo import build_short_raw_vo
from pipeline_config import ARTIFACTS, DATA_ROOT, MUSIC_DIR, OUT_V6
from ralf_vo_bank import build_bank

MOTION_SCORES.write_text((PIPELINE / "v5_action_scene_scores.json").read_text())
MOTION_BONUS.write_text((PIPELINE / "v5_motion_bonus_tags.json").read_text())

TEMPLATES = pc.DATA_ROOT / "v6_story_templates.json"
BANK_PATH = DATA_ROOT / "ralf_vo_bank.json"
OUT_RAW = DATA_ROOT / "out_raw_vo"

PILOT_IDS = [
    "DE-01", "DE-02", "DE-03", "DE-04", "DE-05",
    "EN-01", "EN-02", "EN-03", "EN-04", "EN-05",
]


def music_for(cfg: dict) -> Path:
    key = cfg.get("music_key") or "bed_chill_depth.mp3"
    p = MUSIC_DIR / key
    if p.exists():
        return p
    for alt in sorted(MUSIC_DIR.glob("*.mp3")):
        return alt
    raise RuntimeError(f"No music in {MUSIC_DIR}")


def build_one(sid: str, bank: dict, upload: bool = False) -> dict:
    themes = json.loads(TEMPLATES.read_text(encoding="utf-8"))["themes"]
    if sid not in themes:
        raise KeyError(sid)
    cfg = themes[sid]
    music = music_for(cfg)
    out = OUT_RAW / f"{sid}_raw_vo.mp4"
    meta = build_short_raw_vo(sid, cfg, bank, out, music)

    if upload:
        from upload_short import upload_short

        try:
            from youtube_delete_safety import register_agent_upload
        except ImportError:
            register_agent_upload = lambda *a, **k: None

        desc = (
            f"{cfg['title']}\n\n#Shorts #EMobility\n"
            f"{'@the.emobilist' if cfg['lang'] == 'de' else '@emobilistusa'}\n"
            f"RAW Ralf VO — unlisted for review"
        )
        try:
            up = upload_short(
                cfg["channel"], str(out), cfg["title"][:100], desc,
                cfg["tags"], publish_at=None, privacy_status="unlisted",
            )
            vid = up.get("id")
            register_agent_upload(
                vid, channel=cfg["channel"], story_id=sid,
                title=cfg["title"], version="raw_vo",
            )
            meta["videoId"] = vid
            meta["url"] = f"https://youtu.be/{vid}"
            print(f"  uploaded unlisted: {meta['url']}")
        except Exception as e:
            meta["upload_error"] = str(e)
            print(f"  upload skipped: {e}")

    # Copy to artifacts for review
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    artifact_mp4 = ARTIFACTS / f"{sid}_raw_vo.mp4"
    shutil.copy2(out, artifact_mp4)
    meta["artifact"] = str(artifact_mp4)
    (ARTIFACTS / f"pilot_{sid}_raw_vo.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return meta


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", default=",".join(PILOT_IDS))
    ap.add_argument("--upload", action="store_true")
    ap.add_argument("--rebuild-bank", action="store_true")
    args = ap.parse_args()

    ids = [s.strip() for s in args.ids.split(",") if s.strip()]
    bank = build_bank(force=args.rebuild_bank or not BANK_PATH.exists())

    if bank["count"] < 20:
        print(f"WARN: only {bank['count']} VO segments — quality may suffer")

    results, errors = [], []
    for sid in ids:
        try:
            results.append(build_one(sid, bank, upload=args.upload))
        except Exception as e:
            errors.append({"id": sid, "error": str(e)})
            print(f"ERROR {sid}: {e}")

    summary = {
        "version": "raw_vo",
        "built": len(results),
        "errors": errors,
        "videos": [
            {
                "id": r["story_id"],
                "path": r.get("artifact") or r["path"],
                "duration": r.get("duration"),
                "url": r.get("url"),
                "upload_error": r.get("upload_error"),
            }
            for r in results
        ],
    }
    summary_path = ARTIFACTS / "pilot_uploads_raw_vo.json"
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nSummary -> {summary_path} ({len(results)} ok, {len(errors)} errors)")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
