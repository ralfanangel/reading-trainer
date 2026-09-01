"""Automated quality gate for EMOBILIST Shorts (target 8+/10)."""
from __future__ import annotations

from typing import Any


def score_short(meta: dict) -> dict[str, Any]:
    """Score 0-10 based on viral checklist. Returns {score, grade, checks, blockers}."""
    tl = meta.get("timeline") or []
    checks: dict[str, tuple[bool, float, str]] = {}

    # Hook ≤2s (weight 1.5)
    hook_ok = bool(tl) and tl[0].get("dur", 99) <= 2.05
    checks["hook_le_2s"] = (hook_ok, 1.5, "Hook muss in ≤2s landen")

    # Beat pace ≤2.5s (weight 1.5)
    beat_ok = all(e.get("dur", 99) <= 2.55 for e in tl[1:])
    checks["beats_le_2_5s"] = (beat_ok, 1.5, "Schnitte alle ≤2.5s")

    # Duration 25-40s ideal (weight 1.0)
    dur = meta.get("duration", 99)
    dur_ok = 25 <= dur <= 42
    checks["duration_ideal"] = (dur_ok, 1.0, f"Länge {dur}s — ideal 28-38s")

    # Karaoke captions (weight 1.5)
    karaoke = meta.get("karaoke", False)
    checks["karaoke_captions"] = (karaoke, 1.5, "Word-by-word Karaoke-Captions")

    # Voice quality (weight 2.0)
    engine = meta.get("vo_engine", "edge-tts")
    voice_ok = engine == "elevenlabs"
    checks["ralf_voice"] = (voice_ok, 2.0, f"Stimme: {engine} (ElevenLabs = Ralf-Klon)")

    # Visual match (weight 1.0)
    min_match = min((e.get("match_score") or 0) for e in tl) if tl else 0
    match_ok = min_match >= 0.34
    checks["visual_match"] = (match_ok, 1.0, f"Min clip-match {min_match:.2f}")

    # Structure phases (weight 1.0)
    phases = {e.get("phase") for e in tl}
    struct_ok = {"STOP", "CURIOSITY", "PAYOFF", "LOOP"} <= phases
    checks["viral_structure"] = (struct_ok, 1.0, "STOP→CURIOSITY→PAYOFF→LOOP")

    # SFX on cuts (weight 0.5)
    sfx = meta.get("sfx_on_cuts", False)
    checks["sfx_cuts"] = (sfx, 0.5, "SFX bei Schnitten")

    # Zoom punch hook (weight 0.5)
    zoom = meta.get("hook_zoom", False)
    checks["hook_zoom"] = (zoom, 0.5, "Zoom-Punch im Hook")

    # VO info density (weight 0.5)
    vo_info = meta.get("vo_has_info", False)
    checks["vo_info"] = (vo_info, 0.5, "Konkrete Produktinfos im VO")

    total_weight = sum(w for _, w, _ in checks.values())
    earned = sum(w for ok, w, _ in checks.values() if ok)
    score = round(10 * earned / total_weight, 1) if total_weight else 0.0

    blockers = [msg for ok, _, msg in checks.values() if not ok]
    grade = (
        "EXCELLENT" if score >= 8.5
        else "GOOD" if score >= 7.0
        else "ACCEPTABLE" if score >= 5.5
        else "POOR"
    )

    return {
        "score": score,
        "grade": grade,
        "pass_upload": score >= 7.0,
        "checks": {k: {"ok": v[0], "weight": v[1], "note": v[2]} for k, v in checks.items()},
        "blockers": blockers,
    }
