#!/usr/bin/env python3
"""Rebuild 12 pilot Shorts V4 — visual-text aligned + music variance."""
from __future__ import annotations

import json
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, "/tmp/shorts_pipeline")
from build_short_v2 import CAPTION_FONT_SIZE, face_score, lint_srt_file, probe_duration
from build_short_v4 import build_short_v4
from upload_short import refresh, upload_short

ROOT = Path("/tmp/shorts_pipeline")
FOUND = Path("/tmp/synology_found_videos.json")
SESS = Path("/tmp/synology_session.json")
OUT = ROOT / "out_v4"
SUBS = ROOT / "subs_v4"
ART = Path("/opt/cursor/artifacts")
MUSIC_DIR = ROOT / "music"

LOCAL_RAW_MAP = {
    "241217_OneWheel": ROOT / "raw" / "pilot_onewheel",
    "250906_Ohlala Kids Dirt Bike": ROOT / "raw" / "pilot_ohlala",
    "250413_TST_002 Fatbike": ROOT / "raw" / "pilot_tst",
    "250322_VitilanV3": ROOT / "raw" / "pilot_vitilan",
    "250513_Invanti_Tide2": ROOT / "raw" / "250513_Invanti_Tide2",
    "250103_LUMOS_Hemlet": ROOT / "raw" / "250103_LUMOS_Hemlet",
}

PROJECT_KEY = {
    "241217_OneWheel": "onewheel",
    "250906_Ohlala Kids Dirt Bike": "ohlala",
    "250413_TST_002 Fatbike": "tst",
    "250322_VitilanV3": "vitilan",
    "250513_Invanti_Tide2": "invanti",
    "250103_LUMOS_Hemlet": "lumos",
}

# Distinct beds — rotate across the 6 themes (DE/EN share theme music)
MUSIC_MAP = {
    "DE-01": MUSIC_DIR / "bed_chill_depth.mp3",
    "EN-01": MUSIC_DIR / "bed_chill_depth.mp3",
    "DE-02": MUSIC_DIR / "bed_dance_maximize.mp3",
    "EN-02": MUSIC_DIR / "bed_dance_maximize.mp3",
    "DE-03": MUSIC_DIR / "bed_action_avenger.mp3",
    "EN-03": MUSIC_DIR / "bed_action_avenger.mp3",
    "DE-04": MUSIC_DIR / "bed_ambient_isobars.mp3",
    "EN-04": MUSIC_DIR / "bed_ambient_isobars.mp3",
    "DE-05": MUSIC_DIR / "bed_acoustic_circles.mp3",
    "EN-05": MUSIC_DIR / "bed_acoustic_circles.mp3",
    "DE-06": MUSIC_DIR / "bed_dance_nightclub.mp3",
    "EN-06": MUSIC_DIR / "bed_dance_nightclub.mp3",
}

# Stories rewritten so every caption claim has a verified matching visual.
# visual_plan[i] aligns with [hook, *beats, cta].
STORIES = {
    "DE-01": {
        "lang": "de",
        "channel": "de",
        "raw": "241217_OneWheel",
        "project": "onewheel",
        "title": "Onewheel auf der Straße — Regeln checken",
        "publishAt": "2026-08-26T15:00:00Z",
        "story": {
            "hook": "Ein Rad. Asphalt. Flow.",
            "beats": [
                "Onewheel — so rollt’s",
                "Detail: Pint X Board",
                "Spaß ist echt. Regeln auch.",
                "Erst Rechtlage — dann rollen",
            ],
            "cta": "Mehr Tests → @the.emobilist",
            "visual_plan": [
                {"label": "hook", "need": ["onewheel", "street_ride"]},
                {"label": "ride", "need": ["onewheel", "street_ride", "ride"]},
                {"label": "detail", "need": ["onewheel", "product_close"]},
                {"label": "rules", "need": ["onewheel", "street_ride"]},
                {"label": "payoff", "need": ["onewheel", "board"]},
                {"label": "cta", "need": ["onewheel", "product_close"]},
            ],
        },
        "tags": ["Shorts", "Onewheel", "EMobilität", "Straße"],
    },
    "EN-01": {
        "lang": "en",
        "channel": "usa",
        "raw": "241217_OneWheel",
        "project": "onewheel",
        "title": "Onewheel on the street — check the rules",
        "publishAt": "2026-08-26T22:00:00Z",
        "story": {
            "hook": "One wheel. Street flow.",
            "beats": [
                "Onewheel — how it rolls",
                "Close-up: Pint X board",
                "Fun is real. Rules are too.",
                "Know local rules. Then roll.",
            ],
            "cta": "More tests → @emobilistusa",
            "visual_plan": [
                {"label": "hook", "need": ["onewheel", "street_ride"]},
                {"label": "ride", "need": ["onewheel", "street_ride", "ride"]},
                {"label": "detail", "need": ["onewheel", "product_close"]},
                {"label": "rules", "need": ["onewheel", "street_ride"]},
                {"label": "payoff", "need": ["onewheel", "board"]},
                {"label": "cta", "need": ["onewheel", "product_close"]},
            ],
        },
        "tags": ["Shorts", "Onewheel", "street", "micromobility"],
    },
    "DE-02": {
        "lang": "de",
        "channel": "de",
        "raw": "250906_Ohlala Kids Dirt Bike",
        "project": "ohlala",
        "title": "Kids-Dirtbike unter 1000€ — sinnvoll oder Risiko?",
        "publishAt": "2026-08-27T15:00:00Z",
        "story": {
            "hook": "Kids-Dirtbike — los geht’s",
            "beats": [
                "Rasen. Drehmoment. Grinsen.",
                "Staub und knubbelige Reifen",
                "Helm drauf — kein Spaß ohne",
                "Für wen es sich lohnt",
            ],
            "cta": "Volltest → @the.emobilist",
            "visual_plan": [
                {"label": "hook", "need": ["kids_dirtbike", "ride"]},
                {"label": "lawn", "need": ["kids_dirtbike", "lawn_outdoors"]},
                {"label": "dust", "need": ["kids_dirtbike", "dust", "ride"]},
                {"label": "helmet", "need": ["kids_dirtbike", "helmet_plain"]},
                {"label": "who", "need": ["kids_dirtbike", "ride"]},
                {"label": "cta", "need": ["kids_dirtbike", "product"]},
            ],
        },
        "tags": ["Shorts", "KidsDirtBike", "Ohlala", "EBike"],
    },
    "EN-02": {
        "lang": "en",
        "channel": "usa",
        "raw": "250906_Ohlala Kids Dirt Bike",
        "project": "ohlala",
        "title": "Kids dirt bike under $1000 — worth it?",
        "publishAt": "2026-08-27T22:00:00Z",
        "story": {
            "hook": "Kids dirt bike — full send",
            "beats": [
                "Lawn. Torque. Big smiles.",
                "Dust and knobby tires",
                "Helmet on — non-negotiable",
                "Who should buy — who waits",
            ],
            "cta": "Full review → @emobilistusa",
            "visual_plan": [
                {"label": "hook", "need": ["kids_dirtbike", "ride"]},
                {"label": "lawn", "need": ["kids_dirtbike", "lawn_outdoors"]},
                {"label": "dust", "need": ["kids_dirtbike", "dust", "ride"]},
                {"label": "helmet", "need": ["kids_dirtbike", "helmet_plain"]},
                {"label": "who", "need": ["kids_dirtbike", "ride"]},
                {"label": "cta", "need": ["kids_dirtbike", "product"]},
            ],
        },
        "tags": ["Shorts", "kids", "dirtbike", "electric"],
    },
    "DE-03": {
        "lang": "de",
        "channel": "de",
        "raw": "250413_TST_002 Fatbike",
        "project": "tst",
        "title": "1000$-Fatbike: Mofa-Killer oder Show?",
        "publishAt": "2026-08-28T15:00:00Z",
        "story": {
            "hook": "Fatbike im Studio — Look",
            "beats": [
                "Dicke Reifen. Harter Punch.",
                "Close-up: Frame und Reifen",
                "Straße: so fährt sich’s",
                "Ehrlich: für wen es passt",
            ],
            "cta": "Mehr Fatbikes → @the.emobilist",
            "visual_plan": [
                {"label": "hook", "need": ["fatbike", "workshop", "product"]},
                {"label": "tires", "need": ["fatbike", "product"]},
                {"label": "detail", "need": ["fatbike", "product_close"]},
                {"label": "street", "need": ["fatbike", "street_ride"]},
                {"label": "who", "need": ["fatbike", "product"]},
                {"label": "cta", "need": ["fatbike", "workshop"]},
            ],
        },
        "tags": ["Shorts", "Fatbike", "TST", "EBike"],
    },
    "EN-03": {
        "lang": "en",
        "channel": "usa",
        "raw": "250413_TST_002 Fatbike",
        "project": "tst",
        "title": "$1000 fatbike: moped killer or hype?",
        "publishAt": "2026-08-28T22:00:00Z",
        "story": {
            "hook": "Fatbike in studio — look",
            "beats": [
                "Fat tires. Hard launch.",
                "Close-up: frame and rubber",
                "Street test: how it rides",
                "Honest take: who buys this",
            ],
            "cta": "More fatbikes → @emobilistusa",
            "visual_plan": [
                {"label": "hook", "need": ["fatbike", "workshop", "product"]},
                {"label": "tires", "need": ["fatbike", "product"]},
                {"label": "detail", "need": ["fatbike", "product_close"]},
                {"label": "street", "need": ["fatbike", "street_ride"]},
                {"label": "who", "need": ["fatbike", "product"]},
                {"label": "cta", "need": ["fatbike", "workshop"]},
            ],
        },
        "tags": ["Shorts", "fatbike", "TST", "ebike"],
    },
    "DE-04": {
        "lang": "de",
        "channel": "de",
        "raw": "250322_VitilanV3",
        "project": "vitilan",
        "title": "Klapprad Vitilan V3 — so klappt’s wirklich",
        "publishAt": "2026-08-29T15:00:00Z",
        "story": {
            "hook": "Vitilan V3 — Klapprad",
            "beats": [
                "Klappen: so sieht’s aus",
                "Kompakt auf dem Boden",
                "Stadt-Tempo auf der Straße",
                "Pendler-Waffe oder Spielzeug?",
            ],
            "cta": "Details → @the.emobilist",
            "visual_plan": [
                {"label": "hook", "need": ["vitilan", "product"]},
                {"label": "fold_action", "need": ["fold", "folding"]},
                {"label": "folded", "need": ["fold", "folding"]},
                {"label": "ride", "need": ["vitilan", "street_ride", "ride"]},
                {"label": "who", "need": ["vitilan", "product"]},
                {"label": "cta", "need": ["vitilan", "workshop"]},
            ],
        },
        "tags": ["Shorts", "Vitilan", "Klapprad", "EBike"],
    },
    "EN-04": {
        "lang": "en",
        "channel": "usa",
        "raw": "250322_VitilanV3",
        "project": "vitilan",
        "title": "Vitilan V3 folding ebike — real fold demo",
        "publishAt": "2026-08-29T22:00:00Z",
        "story": {
            "hook": "Vitilan V3 — folding bike",
            "beats": [
                "Folding: watch it collapse",
                "Compact on the garage floor",
                "City pace on the street",
                "Daily driver or weekend toy?",
            ],
            "cta": "Full specs → @emobilistusa",
            "visual_plan": [
                {"label": "hook", "need": ["vitilan", "product"]},
                {"label": "fold_action", "need": ["fold", "folding"]},
                {"label": "folded", "need": ["fold", "folding"]},
                {"label": "ride", "need": ["vitilan", "street_ride", "ride"]},
                {"label": "who", "need": ["vitilan", "product"]},
                {"label": "cta", "need": ["vitilan", "workshop"]},
            ],
        },
        "tags": ["Shorts", "Vitilan", "folding", "ebike"],
    },
    "DE-05": {
        "lang": "de",
        "channel": "de",
        "raw": "250513_Invanti_Tide2",
        "project": "invanti",
        "title": "699$ Invanti Tide 2 — Deal oder Falle?",
        "publishAt": "2026-08-30T15:00:00Z",
        "story": {
            "hook": "Invanti Tide 2 — Unboxing",
            "beats": [
                "Klappscharnier mittig sichtbar",
                "Akku rein — fertig zum Test",
                "Dicke Reifen + Stadt-Runde",
                "Kauf-Tipp: erst prüfen",
            ],
            "cta": "Ehrlicher Test → @the.emobilist",
            "visual_plan": [
                {"label": "hook", "need": ["invanti", "unbox", "box"]},
                {"label": "hinge", "need": ["invanti", "folding_hinge"]},
                {"label": "battery", "need": ["invanti", "battery"]},
                {"label": "ride", "need": ["invanti", "street_ride", "ride", "fat_tire"]},
                {"label": "tip", "need": ["invanti", "product"]},
                {"label": "cta", "need": ["invanti", "product"]},
            ],
        },
        "tags": ["Shorts", "Amazon", "EBike", "Invanti"],
    },
    "EN-05": {
        "lang": "en",
        "channel": "usa",
        "raw": "250513_Invanti_Tide2",
        "project": "invanti",
        "title": "$699 Invanti Tide 2 — deal or trap?",
        "publishAt": "2026-08-30T22:00:00Z",
        "story": {
            "hook": "Invanti Tide 2 — unboxing",
            "beats": [
                "Center fold hinge — clear",
                "Battery in — ready to test",
                "Fat tires + city loop",
                "Buy tip: inspect first",
            ],
            "cta": "Honest test → @emobilistusa",
            "visual_plan": [
                {"label": "hook", "need": ["invanti", "unbox", "box"]},
                {"label": "hinge", "need": ["invanti", "folding_hinge"]},
                {"label": "battery", "need": ["invanti", "battery"]},
                {"label": "ride", "need": ["invanti", "street_ride", "ride", "fat_tire"]},
                {"label": "tip", "need": ["invanti", "product"]},
                {"label": "cta", "need": ["invanti", "product"]},
            ],
        },
        "tags": ["Shorts", "Amazon", "ebike", "Invanti"],
    },
    "DE-06": {
        "lang": "de",
        "channel": "de",
        "raw": "250103_LUMOS_Hemlet",
        "project": "lumos",
        "title": "Lumos Smart-Helm — Blinker, Lichter, Box",
        "publishAt": "2026-08-31T15:00:00Z",
        "story": {
            "hook": "Lumos-Box — Smart-Helm",
            "beats": [
                "Blinker-Remote: L und R",
                "Helm mit Blinker-Modul",
                "Leuchten an — Firefly",
                "Box: Signale + 360° Licht",
            ],
            "cta": "Helm-Test → @the.emobilist",
            "visual_plan": [
                {"label": "hook", "need": ["lumos_box", "packaging"]},
                {"label": "blinker_remote", "need": ["blinker_remote", "turn_signal_remote", "L_R"]},
                {"label": "helmet_blinker", "need": ["helmet", "helmet_hanging"]},
                {"label": "blinker_light", "need": ["blinker_light", "led_glow", "lights_on"]},
                {"label": "signals_box", "need": ["signals", "blinker_claim", "lights_claim"]},
                {"label": "cta", "need": ["helmet", "helmet_packaging", "safety"]},
            ],
        },
        "tags": ["Shorts", "Lumos", "Helm", "Blinker"],
    },
    "EN-06": {
        "lang": "en",
        "channel": "usa",
        "raw": "250103_LUMOS_Hemlet",
        "project": "lumos",
        "title": "Lumos smart helmet — blinkers, lights, box",
        "publishAt": "2026-08-31T22:00:00Z",
        "story": {
            "hook": "Lumos box — smart helmet",
            "beats": [
                "Blinker remote: L and R",
                "Helmet with blinker module",
                "Lights on — Firefly glow",
                "Box claims: signals + 360°",
            ],
            "cta": "Helmet test → @emobilistusa",
            "visual_plan": [
                {"label": "hook", "need": ["lumos_box", "packaging"]},
                {"label": "blinker_remote", "need": ["blinker_remote", "turn_signal_remote", "L_R"]},
                {"label": "helmet_blinker", "need": ["helmet", "helmet_hanging"]},
                {"label": "blinker_light", "need": ["blinker_light", "led_glow", "lights_on"]},
                {"label": "signals_box", "need": ["signals", "blinker_claim", "lights_claim"]},
                {"label": "cta", "need": ["helmet", "helmet_packaging", "safety"]},
            ],
        },
        "tags": ["Shorts", "Lumos", "helmet", "blinker"],
    },
}


def schedule_slots():
    now = datetime.now(timezone.utc)
    for sid, cfg in STORIES.items():
        dt = datetime.fromisoformat(cfg["publishAt"].replace("Z", "+00:00"))
        while (dt - now).total_seconds() < 2 * 3600:
            dt = dt + timedelta(days=1)
        cfg["publishAt"] = dt.strftime("%Y-%m-%dT%H:%M:%SZ")


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


def clips_for(project: str) -> list[Path]:
    """Prefer curated clips first; probe only candidates (fast)."""
    from build_short_v4 import CURATED

    proj_key = {
        "241217_OneWheel": "onewheel",
        "250906_Ohlala Kids Dirt Bike": "ohlala",
        "250413_TST_002 Fatbike": "tst",
        "250322_VitilanV3": "vitilan",
        "250513_Invanti_Tide2": "invanti",
        "250103_LUMOS_Hemlet": "lumos",
    }.get(project)
    all_clips = local_clips(project)
    curated_names = set((CURATED.get(proj_key) or {}).keys()) if proj_key else set()
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


def verify_music_variance(results: list[dict]) -> dict:
    by_theme = {}
    for r in results:
        theme = r["id"].split("-")[1] if "-" in r["id"] else r["id"]
        # group DE-01/EN-01 as theme 01
        key = r["id"][3:] if r["id"][2] == "-" else r["id"]
        by_theme.setdefault(key, set()).add(Path(r.get("music", "")).name)
    distinct = {Path(r.get("music", "")).name for r in results if r.get("music")}
    return {
        "distinct_tracks": sorted(distinct),
        "n_distinct": len(distinct),
        "ok": len(distinct) >= 4,
        "per_short": {r["id"]: Path(r.get("music", "")).name for r in results},
    }


def main():
    ART.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    SUBS.mkdir(parents=True, exist_ok=True)
    schedule_slots()
    try:
        syno_login()
    except Exception as e:
        print("syno_login warn", e)

    # Ensure music files exist
    for sid, mp in MUSIC_MAP.items():
        if not mp.exists():
            # fallback chain
            for alt in [
                MUSIC_DIR / "bed_pulse.wav",
                MUSIC_DIR / "bed_energy.wav",
            ]:
                if alt.exists():
                    MUSIC_MAP[sid] = alt
                    break
            else:
                raise RuntimeError(f"No music for {sid}")

    results_path = ART / "pilot_uploads_v4.json"
    results = []
    if results_path.exists():
        try:
            results = [r for r in json.load(open(results_path)) if r.get("videoId")]
        except Exception:
            results = []
    done = {r["id"] for r in results}
    errors = []
    music_doc = {}

    print(f"V4 FontSize={CAPTION_FONT_SIZE} + beat→clip matching + music variance")

    for sid, cfg in STORIES.items():
        if sid in done:
            print(f"\n======== {sid} SKIP already uploaded ========")
            continue
        print(f"\n======== {sid} ======== publishAt={cfg['publishAt']}")
        music = MUSIC_MAP[sid]
        music_doc[sid] = {
            "file": music.name,
            "path": str(music),
            "source": "AlumoMusic Synology /usbshare1-2/Schnitt/Musik",
        }
        try:
            clips = clips_for(cfg["raw"])
            print("clips", len(clips), [c.name for c in clips[:8]])
            if len(clips) < 3:
                raise RuntimeError(f"not enough clips ({len(clips)})")

            out = OUT / f"{sid}_v4.mp4"
            if out.exists():
                out.unlink()
            evidence_dir = ART / "v4_frames" / sid
            meta = build_short_v4(
                clips,
                cfg["story"],
                out,
                lang=cfg["lang"],
                project=cfg["project"],
                music=music,
                target_sec=28.0,
                allow_face=False,
                max_face=0.55,
                evidence_dir=evidence_dir,
            )
            # Copy evidence to flat artifacts too
            for i, ep in enumerate(meta.get("evidence") or []):
                src = Path(ep)
                if src.exists():
                    dst = ART / f"v4_{sid}_cap{i+1}.jpg"
                    dst.write_bytes(src.read_bytes())

            # SRT to artifacts
            srt_src = OUT / f"{sid}_v4.srt"
            if srt_src.exists():
                (ART / f"v4_{sid}.srt").write_text(
                    srt_src.read_text(encoding="utf-8"), encoding="utf-8"
                )

            desc = (
                f"{cfg['title']}\n\n#Shorts #EMobility\n"
                f"{'@the.emobilist' if cfg['lang']=='de' else '@emobilistusa'}"
            )
            up = upload_short(
                cfg["channel"],
                str(out),
                cfg["title"],
                desc,
                cfg["tags"],
                publish_at=cfg["publishAt"],
            )
            vid = up.get("id")
            row = {
                "id": sid,
                "channel": cfg["channel"],
                "lang": cfg["lang"],
                "videoId": vid,
                "title": cfg["title"],
                "publishAt": cfg["publishAt"],
                "privacy": "private",
                "url": f"https://youtu.be/{vid}",
                "music": str(music),
                "music_name": music.name,
                "duration": meta["duration"],
                "face_score": meta["face_score"],
                "timeline": meta["timeline"],
                "evidence": meta.get("evidence"),
            }
            results.append(row)
            results_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
            print("uploaded", sid, vid, cfg["publishAt"], music.name)
        except Exception as e:
            import traceback

            traceback.print_exc()
            errors.append({"id": sid, "error": str(e)})
            print("ERROR", sid, e)

    music_var = verify_music_variance(results)
    summary = {
        "version": "v4",
        "uploaded": len(results),
        "errors": errors,
        "music_variance": music_var,
        "music_map": music_doc,
        "font_size": CAPTION_FONT_SIZE,
        "schedule": [{r["id"]: r["publishAt"]} for r in results],
        "ids": {r["id"]: r["videoId"] for r in results},
    }
    (ART / "pilot_uploads_v4_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (ART / "v4_music_map.json").write_text(
        json.dumps({"per_short": music_var["per_short"], "tracks": music_var["distinct_tracks"], "doc": music_doc}, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=2)[:2000])
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
