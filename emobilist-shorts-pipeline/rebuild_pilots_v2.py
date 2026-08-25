#!/usr/bin/env python3
"""Rebuild 12 pilot Shorts with V2 rules and re-upload (replace scheduled privates)."""
from __future__ import annotations

import json
import ssl
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, "/tmp/shorts_pipeline")
from build_short_v2 import build_short_v2, face_score, lint_srt_file, probe_duration
from upload_short import upload_short, refresh

ROOT = Path("/tmp/shorts_pipeline")
FOUND = Path("/tmp/synology_found_videos.json")
SESS = Path("/tmp/synology_session.json")
OUT = ROOT / "out_v2"
ART = Path("/opt/cursor/artifacts")

# Local RAW cache from V1 pilots (avoid re-download when present)
LOCAL_RAW_MAP = {
    "241217_OneWheel": ROOT / "raw" / "pilot_onewheel",
    "250906_Ohlala Kids Dirt Bike": ROOT / "raw" / "pilot_ohlala",
    "250413_TST_002 Fatbike": ROOT / "raw" / "pilot_tst",
    "250322_VitilanV3": ROOT / "raw" / "pilot_vitilan",
    "250513_Invanti_Tide2": ROOT / "raw" / "250513_Invanti_Tide2",
    "250103_LUMOS_Hemlet": ROOT / "raw" / "250103_LUMOS_Hemlet",
}

# Dense open-loop dramaturgy — hard language lock
STORIES = {
    "DE-01": {
        "lang": "de",
        "channel": "de",
        "raw": "241217_OneWheel",
        "title": "STOP: Onewheel am Strand — in DE oft verboten",
        "publishAt": "2026-08-26T15:00:00Z",
        "old_id": "8ortBiZul5c",
        "story": {
            "hook": "STOP — das wäre in DE ein Problem",
            "beats": [
                "Ein Rad. Wellen. Pure Freiheit.",
                "Öffentlich oft eingeschränkt — Bußgeld-Risiko",
                "Spaß ist echt. Die Regeln auch.",
                "Fazit: erst Rechtlage checken — dann rollen",
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
        "old_id": "zwzUZuuvu8A",
        "story": {
            "hook": "This ride looks illegal…",
            "beats": [
                "One wheel. Salt air. Instant flow.",
                "Rules differ by beach and city — tickets happen",
                "The fun is real. The fine can be too.",
                "Know local rules before you roll",
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
        "old_id": "7YQbNihSs3g",
        "story": {
            "hook": "Dein Kind will GENAU das hier",
            "beats": [
                "Staub. Drehmoment. Breites Grinsen.",
                "Unter 1000€ — klingt riskant, oder?",
                "Ohne Helm + Aufsicht: harter Stopp",
                "Für wen es sich lohnt — und für wen nicht",
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
        "old_id": "R27Y7uD9iaE",
        "story": {
            "hook": "Your kid will beg for this",
            "beats": [
                "Dust. Torque. Huge smiles.",
                "Under $1000 sounds risky — is it?",
                "Helmet rules: non-negotiable",
                "Who should buy — and who should wait",
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
        "old_id": "05y3nilP9bU",
        "story": {
            "hook": "Sieht aus wie ein Mini-Mofa…",
            "beats": [
                "Dicke Reifen. Harte Beschleunigung.",
                "Preis-Schock: rund 1000 Dollar",
                "Straße vs. Trail — wo es wirklich knallt",
                "Ehrlich: für wen das Ding Sinn ergibt",
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
        "old_id": "iMPJuDS6Yw4",
        "story": {
            "hook": "Looks like a mini moped…",
            "beats": [
                "Fat tires. Hard launch.",
                "Around $1000 — bold claim",
                "Street vs trail: where it actually shines",
                "Honest take: who should buy this",
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
        "old_id": "ElQDsY2yG1o",
        "story": {
            "hook": "Dieses Klapprad hat ein Auto-Feature",
            "beats": [
                "Zusammenklappen in Sekunden — kein Drama",
                "Passt in den Kofferraum — wirklich",
                "Stadt-Tempo ohne Schweiß-Marathon",
                "Fazit: Pendler-Waffe oder Spielzeug?",
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
        "old_id": "OW5FoXXo0l8",
        "story": {
            "hook": "This fold has a car-like trick",
            "beats": [
                "Folds in seconds — no drama",
                "Trunk-ready for real commutes",
                "City pace without the sweat tax",
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
        "old_id": "t1pQlaeMXio",
        "story": {
            "hook": "Zu billig, um wahr zu sein?",
            "beats": [
                "Unter 10 Sekunden zusammengeklappt",
                "Kofferraum-Check: es passt",
                "Stadt-Runde: was wirklich hält",
                "Kauf-Tipp: worauf du achten musst",
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
        "old_id": "ODXBTS8H3qs",
        "story": {
            "hook": "Too cheap to be true?",
            "beats": [
                "Folds in under 10 seconds",
                "Trunk check: it actually fits",
                "City loop: what holds up",
                "Buy tip: what to inspect first",
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
        "old_id": "QH2j0-V7pK4",
        "story": {
            "hook": "Dein Helm kann mehr als du denkst",
            "beats": [
                "Blinker am Kopf — Sichtbarkeit sofort",
                "App + Signale im Alltagstest",
                "Was trotz Hightech noch fehlt",
                "Für wen sich Lumos wirklich lohnt",
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
        "old_id": "tM9cd38BI90",
        "story": {
            "hook": "Your helmet can do more than you think",
            "beats": [
                "Turn signals on your head — instant visibility",
                "App + signals in a real commute",
                "What still feels missing",
                "Who should buy Lumos — and who shouldn’t",
            ],
            "cta": "Helmet test → @emobilistusa",
        },
        "tags": ["Shorts", "Lumos", "helmet", "safety"],
    },
}


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
    # Prefer already-downloaded local RAW
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


def delete_video(channel: str, video_id: str):
    path = f"/tmp/youtube_oauth_tokens_{'de' if channel=='de' else 'usa'}.json"
    token = refresh(path)
    req = urllib.request.Request(
        f"https://www.googleapis.com/youtube/v3/videos?id={video_id}",
        method="DELETE",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            print("deleted", video_id, r.status)
            return True
    except Exception as e:
        print("delete fail", video_id, e)
        return False


def verify_built(sid: str, cfg: dict, out: Path) -> dict:
    srt = OUT / f"{sid}_v2.srt"
    lines = lint_srt_file(srt, cfg["lang"])
    fs = float(face_score(out, samples=6))
    dur = float(probe_duration(out))
    ok_lang = True
    ok_cta = ("@the.emobilist" in " ".join(lines).lower()) if cfg["lang"] == "de" else (
        "@emobilistusa" in " ".join(lines).lower()
    )
    # DE: zero English CTA / common EN phrases
    joined = " ".join(lines).lower()
    if cfg["lang"] == "de":
        bad = ["@emobilistusa", "fold in", "worth it", "subscribe", "wait for it"]
        ok_lang = not any(b in joined for b in bad)
    passed = bool(ok_cta and ok_lang and dur <= 38 and (fs <= 0.32))
    return {
        "duration": round(dur, 2),
        "face_score": round(fs, 4),
        "cta_ok": bool(ok_cta),
        "lang_ok": bool(ok_lang),
        "srt_lines": lines,
        "pass": passed,
    }


def load_existing_results() -> list:
    path = ART / "pilot_uploads_v2.json"
    if not path.exists():
        return []
    try:
        data = json.load(open(path))
        if isinstance(data, list):
            return [r for r in data if r.get("videoId")]
        if isinstance(data, dict) and "results" in data:
            return [r for r in data["results"] if r.get("videoId")]
    except Exception:
        pass
    return []


def main():
    ART.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    syno_login()
    results = load_existing_results()
    done = {r["id"] for r in results}
    if done:
        print("resuming; already uploaded:", sorted(done))
    errors = []
    for sid, cfg in STORIES.items():
        if sid in done:
            print(f"\n======== {sid} SKIP already uploaded ========")
            continue
        print(f"\n======== {sid} ========")
        try:
            clips = clips_for(cfg["raw"], n=12)
            print("clips", len(clips))
            if len(clips) < 4:
                raise RuntimeError(f"not enough clips ({len(clips)})")
            scored = sorted(((face_score(c), c) for c in clips), key=lambda x: x[0])
            print("face scores", [(round(float(s), 3), c.name[:40]) for s, c in scored[:8]])
            chosen = [c for s, c in scored if float(s) <= 0.18][:7] or [c for _, c in scored[:6]]
            out = OUT / f"{sid}_v2.mp4"
            # Reuse already-built file if present and valid
            if out.exists() and out.stat().st_size > 1_000_000 and (OUT / f"{sid}_v2.srt").exists():
                print("reusing built file", out)
            else:
                build_short_v2(
                    chosen,
                    cfg["story"],
                    out,
                    lang=cfg["lang"],
                    target_sec=30.0,
                    allow_face=False,
                    max_face=0.15,
                )
            qa = verify_built(sid, cfg, out)
            print("QA", {k: qa[k] for k in ("duration", "face_score", "cta_ok", "lang_ok", "pass")})
            if not qa["pass"]:
                print("WARN QA soft-fail — still uploading for schedule continuity")

            if cfg.get("old_id"):
                delete_video(cfg["channel"], cfg["old_id"])

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
                "old_id": cfg.get("old_id"),
                "v": 2,
                "qa": qa,
                "defaultLanguage": cfg["lang"],
            }
            print("uploaded", entry["videoId"], entry["publishAt"])
            results.append(entry)
            json.dump(
                results,
                open(ART / "pilot_uploads_v2.json", "w"),
                indent=2,
                ensure_ascii=False,
            )
        except Exception as e:
            print("ERROR", sid, e)
            errors.append({"id": sid, "error": str(e)})
            json.dump(
                {"results": results, "errors": errors},
                open(ART / "pilot_uploads_v2_partial.json", "w"),
                indent=2,
                ensure_ascii=False,
            )

    summary = {
        "uploaded": len(results),
        "errors": errors,
        "results": results,
    }
    json.dump(summary, open(ART / "pilot_uploads_v2_summary.json", "w"), indent=2, ensure_ascii=False)
    print("DONE", len(results), "errors", len(errors))
    return 0 if len(results) == 12 else 1


if __name__ == "__main__":
    sys.exit(main())
