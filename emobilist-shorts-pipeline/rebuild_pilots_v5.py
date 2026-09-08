#!/usr/bin/env python3
"""Locked V5 remake runner — do not overwrite. Builds+uploads all 12 unlisted."""
from __future__ import annotations

import json
import ssl
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, "/tmp/shorts_pipeline")
# Prefer locked builder if present
import importlib.util
spec = importlib.util.spec_from_file_location(
    "build_short_v5_locked", "/tmp/shorts_pipeline/build_short_v5_locked.py"
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
build_short_v5 = mod.build_short_v5

from build_short_v2 import CAPTION_FONT_SIZE, probe_duration
from upload_short import upload_short

try:
    from youtube_delete_safety import register_agent_upload
except Exception:
    def register_agent_upload(*a, **k):
        return None

ROOT = Path("/tmp/shorts_pipeline")
OUT = ROOT / "out_v5"
SUBS = ROOT / "subs_v5"
ART = Path("/opt/cursor/artifacts")
MUSIC_DIR = ROOT / "music"
TEMPLATES = ROOT / "v5_story_templates.json"
SESS = Path("/tmp/synology_session.json")

LOCAL_RAW_MAP = {
    "241217_OneWheel": ROOT / "raw" / "pilot_onewheel",
    "250906_Ohlala Kids Dirt Bike": ROOT / "raw" / "pilot_ohlala",
    "250413_TST_002 Fatbike": ROOT / "raw" / "pilot_tst",
    "250322_VitilanV3": ROOT / "raw" / "pilot_vitilan",
    "250513_Invanti_Tide2": ROOT / "raw" / "250513_Invanti_Tide2",
    "250103_LUMOS_Hemlet": ROOT / "raw" / "250103_LUMOS_Hemlet",
}


def load_templates():
    return json.loads(TEMPLATES.read_text(encoding="utf-8"))["themes"]


def syno_login():
    try:
        creds = json.load(open("/tmp/synology_creds.json"))
        base = "https://emobilist.synology.me:5001"
        ctx = ssl._create_unverified_context()
        params = urllib.parse.urlencode(
            {
                "api": "SYNO.API.Auth",
                "version": "3",
                "method": "login",
                "account": "ralf.schuengel",
                "passwd": creds["password"],
                "session": "FileStation",
                "format": "sid",
            }
        )
        with urllib.request.urlopen(f"{base}/webapi/auth.cgi?{params}", context=ctx, timeout=60) as r:
            login = json.load(r)
        if login.get("success"):
            json.dump({"sid": login["data"]["sid"], "base": base}, open(SESS, "w"))
    except Exception as e:
        print("syno_login warn", e)


def local_clips(project: str):
    d = LOCAL_RAW_MAP.get(project)
    if not d or not d.exists():
        return []
    return [
        p
        for p in sorted(d.iterdir())
        if p.suffix.lower() in {".mov", ".mp4", ".m4v"} and p.stat().st_size >= 5_000_000
    ]


def clips_for(raw_key: str, project: str):
    from build_short_v4 import CURATED

    all_clips = local_clips(raw_key)
    curated_names = set((CURATED.get(project) or {}).keys())
    preferred = [p for p in all_clips if p.stem in curated_names]
    other = [p for p in all_clips if p.stem not in curated_names]
    motion = {}
    scores_path = ROOT / "v5_action_scene_scores.json"
    if scores_path.exists():
        try:
            data = json.loads(scores_path.read_text(encoding="utf-8"))
            for row in data.get(project) or []:
                motion[row["clip"]] = float(row.get("motion") or 0)
        except Exception:
            pass

    def mot(p: Path) -> float:
        return motion.get(p.name, 0.0)

    preferred = sorted(preferred, key=mot, reverse=True)
    other = sorted(other, key=mot, reverse=True)
    candidates = preferred + [p for p in other if mot(p) >= 8.0][:16] + other[:8]
    seen, ordered = set(), []
    for p in candidates:
        if p.name in seen:
            continue
        seen.add(p.name)
        ordered.append(p)
    good = []
    for p in ordered:
        try:
            if probe_duration(p) >= 0.8:
                good.append(p)
        except Exception:
            continue
    return good


def music_for(cfg):
    key = cfg.get("music_key") or "bed_chill_depth.mp3"
    p = MUSIC_DIR / key
    if p.exists():
        return p
    for alt in sorted(MUSIC_DIR.glob("bed_*.mp3")):
        return alt
    raise RuntimeError("no music")


def retention_checklist(meta):
    tl = meta.get("timeline") or []
    checks = {
        "hook_le_2s": bool(tl) and tl[0].get("dur", 99) <= 2.08,
        "beats_le_3s": all(e.get("dur", 99) <= 3.08 for e in tl[1:]),
        "has_curiosity": "CURIOSITY" in [e.get("phase") for e in tl],
        "has_payoff": "PAYOFF" in [e.get("phase") for e in tl],
        "has_loop": "LOOP" in [e.get("phase") for e in tl],
        "duration_le_60": meta.get("duration", 99) <= 60,
        "font_size_56": meta.get("font_size") == CAPTION_FONT_SIZE,
        "music_duck": bool(meta.get("music_duck")),
        "vo_has_info": bool(meta.get("vo_has_info")),
        "visual_match_min": min((e.get("match_score") or 0) for e in tl) >= 0.34 if tl else False,
        "max_seg_le_3": (meta.get("max_segment_dur") or 99) <= 3.08,
    }
    checks["all_ok"] = all(checks.values())
    return checks


def main():
    ART.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    SUBS.mkdir(parents=True, exist_ok=True)
    (ART / "v5_vo_scripts").mkdir(parents=True, exist_ok=True)
    syno_login()
    themes = load_templates()
    results_path = ART / "pilot_uploads_v5.json"
    results = []
    errors = []
    print(f"LOCKED V5 runner FontSize={CAPTION_FONT_SIZE} VO+motion+unlisted n={len(themes)}", flush=True)

    for sid, cfg in themes.items():
        print(f"\n======== {sid} V5 ========", flush=True)
        music = music_for(cfg)
        try:
            clips = clips_for(cfg["raw"], cfg["project"])
            print("clips", len(clips), [c.name for c in clips[:8]], flush=True)
            if len(clips) < 3:
                raise RuntimeError(f"not enough clips ({len(clips)})")
            out = OUT / f"{sid}_v5.mp4"
            if out.exists():
                out.unlink()
            evidence_dir = ART / "v5_frames" / sid
            meta = build_short_v5(
                clips,
                cfg["story"],
                out,
                lang=cfg["lang"],
                project=cfg["project"],
                music=music,
                target_sec=42.0,
                allow_face=False,
                max_face=0.55,
                evidence_dir=evidence_dir,
                prefer_original_sound=True,
            )
            checks = retention_checklist(meta)
            print("retention", json.dumps(checks), flush=True)
            if not checks["hook_le_2s"] or not checks["beats_le_3s"]:
                raise RuntimeError(f"segment length QA failed: {checks}")
            if not checks["vo_has_info"]:
                raise RuntimeError("VO missing concrete product info")

            for i, ep in enumerate(meta.get("evidence") or []):
                src = Path(ep)
                if src.exists():
                    (ART / f"v5_{sid}_cap{i+1}.jpg").write_bytes(src.read_bytes())
            srt_src = OUT / f"{sid}_v5.srt"
            if srt_src.exists():
                (ART / f"v5_{sid}.srt").write_text(srt_src.read_text(encoding="utf-8"), encoding="utf-8")
            vo_src = OUT / f"{sid}_v5_vo.txt"
            if vo_src.exists():
                (ART / "v5_vo_scripts" / f"{sid}_vo.txt").write_text(
                    vo_src.read_text(encoding="utf-8"), encoding="utf-8"
                )

            desc = (
                f"{cfg['title']}\n\n#Shorts #EMobility\n"
                f"{'@the.emobilist' if cfg['lang']=='de' else '@emobilistusa'}\n"
                f"V5 remake — unlisted for review"
            )
            up = upload_short(
                cfg["channel"],
                str(out),
                cfg["title"][:100],
                desc,
                cfg["tags"],
                publish_at=None,
                privacy_status="unlisted",
            )
            vid = up.get("id")
            try:
                register_agent_upload(
                    vid,
                    channel=cfg["channel"],
                    story_id=sid,
                    title=cfg["title"],
                    version="v5",
                    source="run_v5_upload_all",
                )
            except Exception as e:
                print("register warn", e, flush=True)

            row = {
                "id": sid,
                "channel": cfg["channel"],
                "lang": cfg["lang"],
                "title": cfg["title"],
                "videoId": vid,
                "url": f"https://youtu.be/{vid}",
                "privacy": "unlisted",
                "path": str(out),
                "music": str(music),
                "music_name": music.name,
                "duration": meta["duration"],
                "face_score": meta["face_score"],
                "max_segment_dur": meta.get("max_segment_dur"),
                "vo": meta.get("vo"),
                "vo_has_info": meta.get("vo_has_info"),
                "timeline": meta["timeline"],
                "evidence": meta.get("evidence"),
                "retention": checks,
                "reviewPolicy": "unlisted_first",
                "playbook": "STOP→CURIOSITY→ESCALATION→PAYOFF→LOOP",
            }
            results.append(row)
            results_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
            print("uploaded unlisted", sid, vid, f"{meta['duration']:.1f}s", flush=True)
        except Exception as e:
            import traceback
            traceback.print_exc()
            errors.append({"id": sid, "error": str(e)})
            print("ERROR", sid, e, flush=True)

    summary = {
        "version": "v5",
        "built": len(results),
        "errors": errors,
        "font_size": CAPTION_FONT_SIZE,
        "privacy_default": "unlisted",
        "ids": {r["id"]: r.get("videoId") for r in results},
        "unlisted_urls": {r["id"]: r.get("url") for r in results},
        "durations": {r["id"]: r.get("duration") for r in results},
        "max_segment_durs": {r["id"]: r.get("max_segment_dur") for r in results},
    }
    (ART / "pilot_uploads_v5_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps(summary, indent=2)[:3000], flush=True)
    if errors or len(results) < 12:
        sys.exit(1)


if __name__ == "__main__":
    main()
