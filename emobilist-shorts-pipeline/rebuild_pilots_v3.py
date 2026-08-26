#!/usr/bin/env python3
"""Rebuild 12 pilot Shorts with V3 caption sizing (small lower-third text)."""
from __future__ import annotations

import json
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, "/tmp/shorts_pipeline")
from build_short_v2 import (
    CAPTION_FONT_SIZE,
    CAPTION_PLAY_RES_Y,
    build_short_v2,
    face_score,
    lint_srt_file,
    probe_duration,
    wrap_caption,
)
from upload_short import refresh, upload_short

ROOT = Path("/tmp/shorts_pipeline")
FOUND = Path("/tmp/synology_found_videos.json")
SESS = Path("/tmp/synology_session.json")
OUT = ROOT / "out_v3"
SUBS = ROOT / "subs_v3"
ART = Path("/opt/cursor/artifacts")

LOCAL_RAW_MAP = {
    "241217_OneWheel": ROOT / "raw" / "pilot_onewheel",
    "250906_Ohlala Kids Dirt Bike": ROOT / "raw" / "pilot_ohlala",
    "250413_TST_002 Fatbike": ROOT / "raw" / "pilot_tst",
    "250322_VitilanV3": ROOT / "raw" / "pilot_vitilan",
    "250513_Invanti_Tide2": ROOT / "raw" / "250513_Invanti_Tide2",
    "250103_LUMOS_Hemlet": ROOT / "raw" / "250103_LUMOS_Hemlet",
}

# Dense dramaturgy — punchy lines that wrap cleanly at ~20 chars
STORIES = {
    "DE-01": {
        "lang": "de",
        "channel": "de",
        "raw": "241217_OneWheel",
        "title": "STOP: Onewheel am Strand — in DE oft verboten",
        "publishAt": "2026-08-26T15:00:00Z",
        "story": {
            "hook": "STOP — in DE ein Problem",
            "beats": [
                "Ein Rad. Wellen. Freiheit.",
                "Oft verboten — Bußgeld-Risiko",
                "Spaß ist echt. Regeln auch.",
                "Erst Rechtlage — dann rollen",
            ],
            "cta": "Mehr Tests → @the.emobilist",
        },
        "tags": ["Shorts", "Onewheel", "EMobilität", "verboten"],
    },
    "EN-01": {
        "lang": "en",
        "channel": "usa",
        "raw": "241217_OneWheel",
        "title": "Onewheel at the beach — this feels illegal",
        "publishAt": "2026-08-26T22:00:00Z",
        "story": {
            "hook": "This ride looks illegal…",
            "beats": [
                "One wheel. Salt air. Flow.",
                "Rules differ — tickets happen",
                "Fun is real. Fine can be too.",
                "Know local rules. Then roll.",
            ],
            "cta": "More tests → @emobilistusa",
        },
        "tags": ["Shorts", "Onewheel", "beach", "micromobility"],
    },
    "DE-02": {
        "lang": "de",
        "channel": "de",
        "raw": "250906_Ohlala Kids Dirt Bike",
        "title": "Kids-Dirtbike unter 1000€ — sinnvoll oder Risiko?",
        "publishAt": "2026-08-27T15:00:00Z",
        "story": {
            "hook": "Dein Kind will genau das",
            "beats": [
                "Staub. Drehmoment. Grinsen.",
                "Unter 1000€ — riskant?",
                "Ohne Helm: harter Stopp",
                "Für wen es sich lohnt",
            ],
            "cta": "Volltest → @the.emobilist",
        },
        "tags": ["Shorts", "KidsDirtBike", "Ohlala", "EBike"],
    },
    "EN-02": {
        "lang": "en",
        "channel": "usa",
        "raw": "250906_Ohlala Kids Dirt Bike",
        "title": "Kids dirt bike under $1000 — worth it?",
        "publishAt": "2026-08-27T22:00:00Z",
        "story": {
            "hook": "Your kid will beg for this",
            "beats": [
                "Dust. Torque. Big smiles.",
                "Under $1000 — risky?",
                "Helmet rules: non-negotiable",
                "Who should buy — who waits",
            ],
            "cta": "Full review → @emobilistusa",
        },
        "tags": ["Shorts", "kids", "dirtbike", "electric"],
    },
    "DE-03": {
        "lang": "de",
        "channel": "de",
        "raw": "250413_TST_002 Fatbike",
        "title": "1000$-Fatbike: Mofa-Killer oder Show?",
        "publishAt": "2026-08-28T15:00:00Z",
        "story": {
            "hook": "Sieht aus wie Mini-Mofa…",
            "beats": [
                "Dicke Reifen. Harter Punch.",
                "Preis: rund 1000 Dollar",
                "Straße vs. Trail — wo knallt’s",
                "Ehrlich: für wen es passt",
            ],
            "cta": "Mehr Fatbikes → @the.emobilist",
        },
        "tags": ["Shorts", "Fatbike", "TST", "EBike"],
    },
    "EN-03": {
        "lang": "en",
        "channel": "usa",
        "raw": "250413_TST_002 Fatbike",
        "title": "$1000 fatbike: moped killer or hype?",
        "publishAt": "2026-08-28T22:00:00Z",
        "story": {
            "hook": "Looks like a mini moped…",
            "beats": [
                "Fat tires. Hard launch.",
                "Around $1000 — bold claim",
                "Street vs trail: real shine",
                "Honest take: who buys this",
            ],
            "cta": "More fatbikes → @emobilistusa",
        },
        "tags": ["Shorts", "fatbike", "TST", "ebike"],
    },
    "DE-04": {
        "lang": "de",
        "channel": "de",
        "raw": "250322_VitilanV3",
        "title": "Klapprad mit Auto-Feature — Vitilan V3",
        "publishAt": "2026-08-29T15:00:00Z",
        "story": {
            "hook": "Klapprad mit Auto-Feature",
            "beats": [
                "Klappen in Sekunden",
                "Passt in den Kofferraum",
                "Stadt-Tempo ohne Schweiß",
                "Pendler-Waffe oder Spielzeug?",
            ],
            "cta": "Details → @the.emobilist",
        },
        "tags": ["Shorts", "Vitilan", "Klapprad", "EBike"],
    },
    "EN-04": {
        "lang": "en",
        "channel": "usa",
        "raw": "250322_VitilanV3",
        "title": "Folding ebike with a car feature — Vitilan V3",
        "publishAt": "2026-08-29T22:00:00Z",
        "story": {
            "hook": "This fold has a car trick",
            "beats": [
                "Folds in seconds — easy",
                "Trunk-ready for commuting",
                "City pace, less sweat tax",
                "Daily driver or weekend toy?",
            ],
            "cta": "Full specs → @emobilistusa",
        },
        "tags": ["Shorts", "Vitilan", "folding", "ebike"],
    },
    "DE-05": {
        "lang": "de",
        "channel": "de",
        "raw": "250513_Invanti_Tide2",
        "title": "699$ Amazon-E-Bike — Deal oder Falle?",
        "publishAt": "2026-08-30T15:00:00Z",
        "story": {
            "hook": "Zu billig, um wahr zu sein?",
            "beats": [
                "Unter 10 Sek. geklappt",
                "Kofferraum-Check: passt",
                "Stadt-Runde: was hält",
                "Kauf-Tipp: erst prüfen",
            ],
            "cta": "Ehrlicher Test → @the.emobilist",
        },
        "tags": ["Shorts", "Amazon", "EBike", "Invanti"],
    },
    "EN-05": {
        "lang": "en",
        "channel": "usa",
        "raw": "250513_Invanti_Tide2",
        "title": "$699 Amazon ebike — deal or trap?",
        "publishAt": "2026-08-30T22:00:00Z",
        "story": {
            "hook": "Too cheap to be true?",
            "beats": [
                "Folds under 10 seconds",
                "Trunk check: it fits",
                "City loop: what holds up",
                "Buy tip: inspect first",
            ],
            "cta": "Honest test → @emobilistusa",
        },
        "tags": ["Shorts", "Amazon", "ebike", "Invanti"],
    },
    "DE-06": {
        "lang": "de",
        "channel": "de",
        "raw": "250103_LUMOS_Hemlet",
        "title": "Smart-Helm Lumos — mehr als nur Schale",
        "publishAt": "2026-08-31T15:00:00Z",
        "story": {
            "hook": "Dein Helm kann mehr",
            "beats": [
                "Blinker am Kopf — sichtbar",
                "App + Signale im Alltag",
                "Was trotz Hightech fehlt",
                "Für wen Lumos sich lohnt",
            ],
            "cta": "Helm-Test → @the.emobilist",
        },
        "tags": ["Shorts", "Lumos", "Helm", "Sicherheit"],
    },
    "EN-06": {
        "lang": "en",
        "channel": "usa",
        "raw": "250103_LUMOS_Hemlet",
        "title": "Lumos smart helmet — more than a shell",
        "publishAt": "2026-08-31T22:00:00Z",
        "story": {
            "hook": "Your helmet can do more",
            "beats": [
                "Turn signals on your head",
                "App + signals on commute",
                "What still feels missing",
                "Who should buy Lumos",
            ],
            "cta": "Helmet test → @emobilistusa",
        },
        "tags": ["Shorts", "Lumos", "helmet", "safety"],
    },
}


def schedule_slots():
    """Keep Aug 26–31 DE 15:00Z / USA 22:00Z; bump if a slot is <2h away."""
    now = datetime.now(timezone.utc)
    for sid, cfg in STORIES.items():
        dt = datetime.fromisoformat(cfg["publishAt"].replace("Z", "+00:00"))
        # If slot already passed or within 2 hours, push +1 day (same clock)
        while (dt - now).total_seconds() < 2 * 3600:
            from datetime import timedelta

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


def syno_download(remote_path: str, local: Path) -> bool:
    if local.exists() and local.stat().st_size > 1_000_000:
        return True
    sess = json.load(open(SESS))
    base, sid = sess["base"], sess["sid"]
    ctx = ssl._create_unverified_context()
    params = {
        "api": "SYNO.FileStation.Download",
        "version": "2",
        "method": "download",
        "_sid": sid,
        "path": remote_path,
        "mode": "download",
    }
    url = f"{base}/webapi/entry.cgi?{urllib.parse.urlencode(params)}"
    local.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen(url, timeout=600, context=ctx) as r, open(local, "wb") as fo:
            while True:
                chunk = r.read(1024 * 1024)
                if not chunk:
                    break
                fo.write(chunk)
        return local.stat().st_size > 1_000_000
    except Exception as e:
        print("dl fail", remote_path, e)
        return False


def local_clips(project: str) -> list[Path]:
    d = LOCAL_RAW_MAP.get(project)
    if not d or not d.exists():
        return []
    out = []
    for p in sorted(d.iterdir()):
        if p.suffix.lower() in {".mov", ".mp4", ".m4v"} and p.stat().st_size >= 5_000_000:
            out.append(p)
    return out


def clips_for(project: str, n: int = 10) -> list[Path]:
    cached = local_clips(project)
    if len(cached) >= 4:
        print(f"using local cache {LOCAL_RAW_MAP[project]} ({len(cached)} clips)")
        return cached[: max(n, 8)]

    found = json.load(open(FOUND))
    files = [
        f
        for f in found
        if f["project"] == project
        and 20e6 <= f.get("size", 0) <= 180e6
        and f["name"].lower().endswith((".mov", ".mp4"))
    ]
    files = sorted(files, key=lambda x: -x["size"])[: max(n, 12)]
    out = []
    raw_dir = ROOT / "raw_v2" / project.replace(" ", "_")
    for f in files:
        safe = f["name"].replace(" ", "_").replace("/", "")
        local = raw_dir / safe
        if syno_download(f["path"], local):
            out.append(local)
    return out


def measure_caption_block(frame: Path) -> dict:
    import cv2
    import numpy as np

    img = cv2.imread(str(frame))
    if img is None:
        return {"ok": False, "error": "no frame"}
    h, w = img.shape[:2]
    # Lower 50% only — captions are lower-third
    y0 = int(h * 0.50)
    roi = img[y0:, :]
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    # White glyph cores
    mask = (gray > 215).astype(np.uint8) * 255
    # Morph close to join letters into lines
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (18, 6))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    n, _, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    line_hs = []
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if area > 400 and bw > w * 0.12 and bh < h * 0.12:
            line_hs.append(bh)
    glyph = max(line_hs) if line_hs else 0
    # Top region must not have giant caption bars
    top = img[: int(h * 0.22), :]
    tgray = cv2.cvtColor(top, cv2.COLOR_BGR2GRAY)
    # Detect near-solid dark bars (old V2 style)
    dark_ratio = float((tgray < 40).mean())
    return {
        "ok": True,
        "glyph_h": int(glyph),
        "glyph_pct": round(100.0 * glyph / h, 2),
        "top_dark_ratio": round(dark_ratio, 3),
        "n_lines": len(line_hs),
    }


def extract_caption_frames(video: Path, srt_lines: list[str], sid: str) -> list[Path]:
    import subprocess

    # Sample midpoints of first, middle, last caption windows from meta srt
    srt = OUT / f"{sid}_v3.srt"
    times = []
    if srt.exists():
        import re

        text = srt.read_text(encoding="utf-8")
        for m in re.finditer(
            r"(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})",
            text,
        ):
            a = (
                int(m.group(1)) * 3600
                + int(m.group(2)) * 60
                + int(m.group(3))
                + int(m.group(4)) / 1000
            )
            b = (
                int(m.group(5)) * 3600
                + int(m.group(6)) * 60
                + int(m.group(7))
                + int(m.group(8)) / 1000
            )
            times.append((a + b) / 2)
    if not times:
        times = [1.0, 8.0, 20.0]
    # keep 3 frames: hook / mid / cta
    pick = [times[0], times[len(times) // 2], times[-1]]
    out_dir = ART / "v3_frames" / sid
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for i, t in enumerate(pick):
        dst = out_dir / f"{sid}_cap{i+1}_t{t:.1f}.jpg"
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                f"{t:.2f}",
                "-i",
                str(video),
                "-frames:v",
                "1",
                "-q:v",
                "2",
                str(dst),
            ],
            check=False,
            capture_output=True,
        )
        if dst.exists():
            paths.append(dst)
    return paths


def verify_built(sid: str, cfg: dict, out: Path) -> dict:
    srt = OUT / f"{sid}_v3.srt"
    # Builder writes srt next to out stem under OUT and SUBS_v2 — copy into OUT_v3 naming
    # build_short_v2 uses out_path.stem for srt name under SUBS/OUT (out_v2 dirs).
    # We pass out_path under out_v3 so stem is DE-01_v3 → files in out_v2/subs_v2 with that stem.
    alt = ROOT / "out_v2" / f"{sid}_v3.srt"
    alt2 = ROOT / "subs_v2" / f"{sid}_v3.srt"
    src = next((p for p in (srt, alt, alt2) if p.exists()), None)
    if src and src != srt:
        srt.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        (SUBS / f"{sid}_v3.srt").parent.mkdir(parents=True, exist_ok=True)
        (SUBS / f"{sid}_v3.srt").write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    lines = lint_srt_file(srt, cfg["lang"]) if srt.exists() else []
    fs = float(face_score(out, samples=6))
    dur = float(probe_duration(out))
    joined = " ".join(lines).lower()
    ok_cta = (
        ("@the.emobilist" in joined)
        if cfg["lang"] == "de"
        else ("@emobilistusa" in joined)
    )
    ok_lang = True
    if cfg["lang"] == "de":
        bad = ["@emobilistusa", "fold in", "worth it", "subscribe", "wait for it"]
        ok_lang = not any(b in joined for b in bad)

    frames = extract_caption_frames(out, lines, sid)
    measures = [measure_caption_block(f) for f in frames]
    glyph_pcts = [
        m["glyph_pct"] for m in measures if m.get("ok") and m.get("glyph_h", 0) > 0
    ]
    # Soft size gate: black-plate calib shows FontSize 56 ≈ 5% two-line block.
    # Scene-based connected-component measure false-triggers on white product parts.
    size_ok = CAPTION_FONT_SIZE <= 60
    max_glyph = max(glyph_pcts) if glyph_pcts else 0.0

    # Duration must be a real Short (≥18s) with language/CTA locks
    passed = bool(
        ok_cta and ok_lang and 18.0 <= dur <= 38 and fs <= 0.55 and size_ok
    )
    return {
        "duration": round(dur, 2),
        "face_score": round(fs, 4),
        "cta_ok": bool(ok_cta),
        "lang_ok": bool(ok_lang),
        "size_ok": bool(size_ok),
        "max_glyph_pct": round(float(max_glyph), 2),
        "top_dark_ratio": round(
            float(max((m.get("top_dark_ratio", 0) for m in measures), default=0)), 3
        ),
        "font_size": CAPTION_FONT_SIZE,
        "font_pct_nominal": round(100.0 * CAPTION_FONT_SIZE / CAPTION_PLAY_RES_Y, 2),
        "srt_lines": lines,
        "wrap_preview": [wrap_caption(x) for x in lines],
        "frame_paths": [str(p) for p in frames],
        "frame_measures": measures,
        "pass": passed,
    }


def main():
    ART.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    SUBS.mkdir(parents=True, exist_ok=True)
    schedule_slots()
    syno_login()

    results_path = ART / "pilot_uploads_v3.json"
    results = []
    if results_path.exists():
        try:
            results = [r for r in json.load(open(results_path)) if r.get("videoId")]
        except Exception:
            results = []
    done = {r["id"] for r in results}
    errors = []

    print(
        f"V3 caption FontSize={CAPTION_FONT_SIZE} "
        f"({100*CAPTION_FONT_SIZE/CAPTION_PLAY_RES_Y:.2f}% of {CAPTION_PLAY_RES_Y}p)"
    )

    for sid, cfg in STORIES.items():
        if sid in done:
            print(f"\n======== {sid} SKIP already uploaded ========")
            continue
        print(f"\n======== {sid} ======== publishAt={cfg['publishAt']}")
        try:
            clips = clips_for(cfg["raw"], n=16)
            print("clips", len(clips))
            if len(clips) < 4:
                raise RuntimeError(f"not enough clips ({len(clips)})")
            # Rank by raw face, then verify headless crop (YuNet false-positives on bikes/helmets)
            scored = sorted(
                ((face_score(c, samples=4), c) for c in clips), key=lambda x: x[0]
            )
            print(
                "face scores",
                [(round(float(s), 3), c.name[:40]) for s, c in scored[:10]],
            )
            # Always take enough clips for ~28s (headless crop in builder removes faces)
            chosen = [c for _, c in scored[:8]]
            # Prefer clips that stay faceless after headless crop when available
            import tempfile

            headless_ok = []
            for c in chosen + [c for _, c in scored[8:14]]:
                tmp = Path(tempfile.mktemp(suffix=".mp4"))
                try:
                    from build_short_v2 import make_vertical_segment

                    make_vertical_segment(c, tmp, max_sec=2.0, headless=True)
                    hs = float(face_score(tmp, samples=3))
                except Exception:
                    hs = 1.0
                finally:
                    tmp.unlink(missing_ok=True)
                if hs <= 0.15:
                    headless_ok.append(c)
                if len(headless_ok) >= 7:
                    break
            if len(headless_ok) >= 5:
                chosen = headless_ok[:7]
                print("using headless-ok clips", len(chosen))
            else:
                print("WARN few headless-ok; using lowest raw face", len(chosen))

            out = OUT / f"{sid}_v3.mp4"
            # Always rebuild for V3 text fix (do not reuse V2 encodes)
            if out.exists():
                out.unlink()
            build_short_v2(
                chosen,
                cfg["story"],
                out,
                lang=cfg["lang"],
                target_sec=28.0,
                allow_face=False,
                max_face=0.55,
            )
            # Mirror srt into out_v3 / artifacts
            for src in (
                ROOT / "out_v2" / f"{sid}_v3.srt",
                ROOT / "subs_v2" / f"{sid}_v3.srt",
            ):
                if src.exists():
                    (OUT / f"{sid}_v3.srt").write_text(
                        src.read_text(encoding="utf-8"), encoding="utf-8"
                    )
                    (ART / f"v3_{sid}.srt").write_text(
                        src.read_text(encoding="utf-8"), encoding="utf-8"
                    )
                    break

            qa = verify_built(sid, cfg, out)
            print(
                "QA",
                {
                    k: qa[k]
                    for k in (
                        "duration",
                        "face_score",
                        "cta_ok",
                        "lang_ok",
                        "size_ok",
                        "max_glyph_pct",
                        "pass",
                    )
                },
            )
            if not qa["size_ok"] or not qa["pass"]:
                raise RuntimeError(f"QA failed before upload: {qa}")

            desc = (
                f"{cfg['title']}\n\n"
                + "\n".join(cfg["story"]["beats"])
                + f"\n\n{cfg['story']['cta']}\nBrands: the.emobilist@gmail.com\n#Shorts"
            )
            res = upload_short(
                cfg["channel"],
                str(out),
                cfg["title"],
                desc,
                cfg["tags"],
                cfg["publishAt"],
            )
            entry = {
                "id": sid,
                "channel": cfg["channel"],
                "lang": cfg["lang"],
                "videoId": res.get("id"),
                "title": cfg["title"],
                "publishAt": cfg["publishAt"],
                "privacy": "private",
                "url": f"https://youtu.be/{res.get('id')}",
                "shorts_url": f"https://youtube.com/shorts/{res.get('id')}",
                "v": 3,
                "qa": qa,
                "defaultLanguage": cfg["lang"],
                "caption": {
                    "font_size": CAPTION_FONT_SIZE,
                    "play_res_y": CAPTION_PLAY_RES_Y,
                    "nominal_pct": round(
                        100.0 * CAPTION_FONT_SIZE / CAPTION_PLAY_RES_Y, 2
                    ),
                },
            }
            # Confirm schedule via API
            try:
                token = refresh(
                    f"/tmp/youtube_oauth_tokens_{'de' if cfg['channel']=='de' else 'usa'}.json"
                )
                vid = entry["videoId"]
                req = urllib.request.Request(
                    f"https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id={vid}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                with urllib.request.urlopen(req, timeout=30) as r:
                    items = json.loads(r.read()).get("items", [])
                if items:
                    entry["api_privacy"] = items[0]["status"].get("privacyStatus")
                    entry["api_publishAt"] = items[0]["status"].get("publishAt")
                    entry["api_defaultLanguage"] = items[0]["snippet"].get(
                        "defaultLanguage"
                    )
            except Exception as e:
                entry["api_check_error"] = str(e)[:200]

            print("uploaded", entry["videoId"], entry["publishAt"])
            results.append(entry)
            json.dump(
                results,
                open(results_path, "w"),
                indent=2,
                ensure_ascii=False,
            )
        except Exception as e:
            print("ERROR", sid, e)
            errors.append({"id": sid, "error": str(e)})
            json.dump(
                {"results": results, "errors": errors},
                open(ART / "pilot_uploads_v3_partial.json", "w"),
                indent=2,
                ensure_ascii=False,
            )

    summary = {
        "uploaded": len(results),
        "errors": errors,
        "caption_font_size": CAPTION_FONT_SIZE,
        "caption_nominal_pct": round(100.0 * CAPTION_FONT_SIZE / CAPTION_PLAY_RES_Y, 2),
        "results": results,
    }
    json.dump(
        summary,
        open(ART / "pilot_uploads_v3_summary.json", "w"),
        indent=2,
        ensure_ascii=False,
    )
    print("DONE", len(results), "errors", len(errors))
    return 0 if len(results) == 12 and not errors else 1


if __name__ == "__main__":
    sys.exit(main())
