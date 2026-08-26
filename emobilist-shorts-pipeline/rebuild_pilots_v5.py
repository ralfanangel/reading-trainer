#!/usr/bin/env python3
"""Rebuild EMOBILIST Shorts V5 — viral playbook templates.

Default: build + upload unlisted (no publishAt).
Wait for Ralf V4 feedback before mass remake — use --only for demos.
"""
from __future__ import annotations

import argparse
import json
import ssl
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, "/tmp/shorts_pipeline")
from build_short_v2 import CAPTION_FONT_SIZE, probe_duration
from build_short_v5 import build_short_v5
from upload_short import upload_short

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


def load_templates() -> dict:
    data = json.loads(TEMPLATES.read_text(encoding="utf-8"))
    return data["themes"]


def syno_login():
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
    if not login.get("success"):
        raise RuntimeError(f"Synology login failed: {login}")
    sid = login["data"]["sid"]
    json.dump({"sid": sid, "base": base}, open(SESS, "w"))
    return sid, base


def local_clips(project: str) -> list[Path]:
    d = LOCAL_RAW_MAP.get(project)
    if not d or not d.exists():
        return []
    out = []
    for p in sorted(d.iterdir()):
        if p.suffix.lower() not in {".mov", ".mp4", ".m4v"}:
            continue
        if p.stat().st_size < 5_000_000:
            continue
        out.append(p)
    return out


def clips_for(raw_key: str, project: str) -> list[Path]:
    from build_short_v4 import CURATED

    all_clips = local_clips(raw_key)
    curated_names = set((CURATED.get(project) or {}).keys())
    preferred = [p for p in all_clips if p.stem in curated_names]
    other = [p for p in all_clips if p.stem not in curated_names]
    good = []
    for p in preferred + other[:12]:
        try:
            if probe_duration(p) >= 0.8:
                good.append(p)
        except Exception:
            continue
    return good


def music_for(cfg: dict) -> Path:
    key = cfg.get("music_key") or "bed_chill_depth.mp3"
    p = MUSIC_DIR / key
    if p.exists():
        return p
    for alt in sorted(MUSIC_DIR.glob("bed_*.mp3")):
        return alt
    for alt in [MUSIC_DIR / "bed_pulse.wav", MUSIC_DIR / "bed_energy.wav"]:
        if alt.exists():
            return alt
    raise RuntimeError(f"No music for {cfg.get('title')}")


def retention_checklist(meta: dict) -> dict:
    tl = meta.get("timeline") or []
    hook_ok = bool(tl) and tl[0].get("dur", 99) <= 2.08
    beats_ok = all(e.get("dur", 99) <= 3.08 for e in tl[1:])
    phases = [e.get("phase") for e in tl]
    checks = {
        "hook_le_2s": hook_ok,
        "beats_le_3s": beats_ok,
        "has_curiosity": "CURIOSITY" in phases,
        "has_payoff": "PAYOFF" in phases,
        "has_loop": "LOOP" in phases,
        "duration_le_60": meta.get("duration", 99) <= 60,
        "font_size_56": meta.get("font_size") == CAPTION_FONT_SIZE,
        "music_duck": bool(meta.get("music_duck")),
        "visual_match_min": min((e.get("match_score") or 0) for e in tl) >= 0.34 if tl else False,
        "faceless_or_allowed": meta.get("faceless", True),
    }
    checks["all_ok"] = all(checks.values())
    return checks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="Only build these IDs (e..g. DE-06)")
    ap.add_argument("--no-upload", action="store_true")
    ap.add_argument("--upload", action="store_true", help="Force upload even if --only demo")
    args = ap.parse_args()

    ART.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    SUBS.mkdir(parents=True, exist_ok=True)

    themes = load_templates()
    only = set(args.only) if args.only else None
    do_upload = (not args.no_upload) and (args.upload or only is not None or True)
    # Mass remake guard: without --only, require --upload explicitly
    if only is None and not args.upload:
        print(
            "V5 mass rebuild gated: pass --only ID [ID...] for demo, "
            "or --upload to rebuild all after Ralf approval."
        )
        if not args.no_upload:
            # Still allow dry template validation
            print(f"Templates OK: {len(themes)} stories")
            for sid, cfg in themes.items():
                st = cfg["story"]
                n = 1 + len(st["beats"]) + 1 + (1 if st.get("loop") else 0)
                assert len(st["visual_plan"]) == n, sid
                assert len(st["structure"]) == n, sid
            print("Structure lint OK — exiting without builds.")
            return

    try:
        syno_login()
    except Exception as e:
        print("syno_login warn", e)

    results_path = ART / "pilot_uploads_v5.json"
    results = []
    if results_path.exists():
        try:
            results = [r for r in json.load(open(results_path)) if r.get("videoId") or r.get("path")]
        except Exception:
            results = []
    done = {r["id"] for r in results if r.get("videoId")}
    errors = []

    print(f"V5 FontSize={CAPTION_FONT_SIZE} + viral structure + music duck + unlisted")

    for sid, cfg in themes.items():
        if only and sid not in only:
            continue
        if sid in done and not (only and sid in only):
            print(f"\n======== {sid} SKIP already uploaded ========")
            continue
        print(f"\n======== {sid} V5 ======== unlisted")
        music = music_for(cfg)
        try:
            clips = clips_for(cfg["raw"], cfg["project"])
            print("clips", len(clips), [c.name for c in clips[:8]])
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
                target_sec=38.0,
                allow_face=False,
                max_face=0.55,
                evidence_dir=evidence_dir,
                prefer_original_sound=True,
            )
            checks = retention_checklist(meta)
            print("retention", json.dumps(checks))
            if not checks["all_ok"]:
                print("WARNING retention checklist incomplete", checks)

            for i, ep in enumerate(meta.get("evidence") or []):
                src = Path(ep)
                if src.exists():
                    (ART / f"v5_{sid}_cap{i+1}.jpg").write_bytes(src.read_bytes())
            srt_src = OUT / f"{sid}_v5.srt"
            if srt_src.exists():
                (ART / f"v5_{sid}.srt").write_text(
                    srt_src.read_text(encoding="utf-8"), encoding="utf-8"
                )

            row = {
                "id": sid,
                "channel": cfg["channel"],
                "lang": cfg["lang"],
                "title": cfg["title"],
                "one_idea": cfg.get("one_idea"),
                "open_loop": cfg.get("open_loop"),
                "path": str(out),
                "music": str(music),
                "music_name": music.name,
                "duration": meta["duration"],
                "face_score": meta["face_score"],
                "timeline": meta["timeline"],
                "evidence": meta.get("evidence"),
                "retention": checks,
                "privacy": "unlisted",
                "reviewPolicy": "unlisted_first",
                "playbook": "STOP→CURIOSITY→ESCALATION→PAYOFF→LOOP",
            }

            if do_upload and not args.no_upload:
                desc = (
                    f"{cfg['title']}\n\n#Shorts #EMobility\n"
                    f"{'@the.emobilist' if cfg['lang']=='de' else '@emobilistusa'}\n"
                    f"V5 viral demo — unlisted for review"
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
                row["videoId"] = vid
                row["url"] = f"https://youtu.be/{vid}"
                print("uploaded unlisted", sid, vid)
            else:
                print("built (no upload)", sid, out)

            # replace prior row for same id
            results = [r for r in results if r.get("id") != sid]
            results.append(row)
            results_path.write_text(
                json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8"
            )
        except Exception as e:
            import traceback

            traceback.print_exc()
            errors.append({"id": sid, "error": str(e)})
            print("ERROR", sid, e)

    summary = {
        "version": "v5",
        "built": len(results),
        "errors": errors,
        "font_size": CAPTION_FONT_SIZE,
        "privacy_default": "unlisted",
        "playbook": "/opt/cursor/artifacts/EMOBILIST_VIRAL_SHORTS_PLAYBOOK.md",
        "ids": {r["id"]: r.get("videoId") or r.get("path") for r in results},
    }
    (ART / "pilot_uploads_v5_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps(summary, indent=2)[:2500])
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
