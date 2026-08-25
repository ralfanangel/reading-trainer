#!/usr/bin/env python3
"""Rebuild any V2 pilots that fail YuNet faceless QA (headless crop)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, "/tmp/shorts_pipeline")
import build_short_v2 as b

b._YUNET = None

from build_short_v2 import build_short_v2, face_score
from rebuild_pilots_v2 import STORIES, clips_for, delete_video, syno_login, verify_built
from upload_short import upload_short

ART = Path("/opt/cursor/artifacts")
OUT = Path("/tmp/shorts_pipeline/out_v2")


def main():
    syno_login()
    results = json.load(open(ART / "pilot_uploads_v2.json"))
    by_id = {r["id"]: r for r in results}
    # Re-check all locally
    fail = []
    for sid in STORIES:
        mp4 = OUT / f"{sid}_v2.mp4"
        fs = float(face_score(mp4, samples=10)) if mp4.exists() else 1.0
        print(f"check {sid} face={fs:.3f}")
        if fs >= 0.5:
            fail.append(sid)
    print("NEED FIX", fail)
    for sid in fail:
        cfg = STORIES[sid]
        print(f"\n======== FIX {sid} ========")
        clips = clips_for(cfg["raw"], n=20)
        scored = sorted(((face_score(c, samples=6), c) for c in clips), key=lambda x: x[0])
        print("top", [(round(s, 2), c.name) for s, c in scored[:12]])
        chosen = [c for s, c in scored if s < 0.5][:8]
        if len(chosen) < 4:
            # still use lowest + rely on headless crop
            chosen = [c for _, c in scored[:7]]
        out = OUT / f"{sid}_v2.mp4"
        out.unlink(missing_ok=True)
        (OUT / f"{sid}_v2.srt").unlink(missing_ok=True)
        build_short_v2(
            chosen,
            cfg["story"],
            out,
            lang=cfg["lang"],
            target_sec=28.0,
            allow_face=False,
            max_face=0.5,
        )
        qa = verify_built(sid, cfg, out)
        print("QA", {k: qa[k] for k in ("duration", "face_score", "cta_ok", "lang_ok", "pass")})
        if qa["face_score"] >= 0.5:
            # last resort: more aggressive headless already on; raise if still failing
            print("WARN still faces — uploading product-biased anyway after second headless attempt")
            # retry with only zero-score if any
            zeros = [c for s, c in scored if s == 0.0]
            if len(zeros) >= 3:
                out.unlink(missing_ok=True)
                build_short_v2(
                    zeros[:8],
                    cfg["story"],
                    out,
                    lang=cfg["lang"],
                    target_sec=28.0,
                    allow_face=False,
                    max_face=0.5,
                )
                qa = verify_built(sid, cfg, out)
                print("QA retry", qa["face_score"])
        if qa["face_score"] >= 0.5:
            raise RuntimeError(f"{sid} cannot pass faceless QA")

        old = by_id.get(sid, {}).get("videoId")
        if old:
            delete_video(cfg["channel"], old)
        desc = (
            f"{cfg['title']}\n\n"
            + "\n".join(cfg["story"]["beats"])
            + f"\n\n{cfg['story']['cta']}\nBrands: the.emobilist@gmail.com\n#Shorts"
        )
        res = upload_short(
            cfg["channel"], str(out), cfg["title"], desc, cfg["tags"], cfg["publishAt"]
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
            "old_id": old,
            "v": 2,
            "qa": qa,
            "defaultLanguage": cfg["lang"],
            "face_fix": "yunet+headless",
        }
        print("uploaded", entry["videoId"])
        by_id[sid] = entry
        ordered = [by_id[k] for k in STORIES if k in by_id]
        json.dump(ordered, open(ART / "pilot_uploads_v2.json", "w"), indent=2, ensure_ascii=False)
    print("DONE fixes", fail)


if __name__ == "__main__":
    main()
