#!/usr/bin/env python3
"""Generate compact V6 story templates from V5 (7-8 beats, punchier scripts)."""
from __future__ import annotations

import json
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent
V5 = json.loads((PIPELINE / "v5_story_templates.json").read_text(encoding="utf-8"))
OUT = PIPELINE / "v6_story_templates.json"

# V6 continuous VO scripts per theme (engineer tone, one open loop, concrete facts)
VO_SCRIPTS = {
    "DE-01": (
        "Ein Rad unter den Füßen — warte ab. Asphalt, sofort Flow. Kein Lenker, nur Balance. "
        "Pint X: Spitze sechsundzwanzig Stundenkilometer. Reichweite? Real getestet, nicht nur Spec-Sheet. "
        "Spaß ist echt — aber auf öffentlicher Straße wird's riskant. Erst Rechtlage checken, dann rollen. "
        "Engineer-Check statt Hype. Mehr bei the emobilist."
    ),
    "EN-01": (
        "One wheel under your feet — wait for it. Asphalt, instant flow. No handlebars, just balance. "
        "Pint X tops out around twenty-six mph. Range? Tested in the real world, not just the spec sheet. "
        "The fun is real — but public roads get risky fast. Check the rules first, then ride. "
        "Engineer check, not hype. More at emobilist USA."
    ),
    "DE-02": (
        "Sieht aus wie ein Spielzeug — ist es nicht. Dirt Bike für Kids, aber mit Punch. "
        "Gas geben, Staub fliegt, Grinsen garantiert. Hubraum und Tempo? Für die Größe überraschend. "
        "Aber Helm und Aufsicht sind Pflicht — kein Spaß ohne Safety. "
        "Ehrlicher Test, kein Influencer-Hype. Mehr bei the emobilist."
    ),
    "EN-02": (
        "Looks like a toy — it's not. Kids dirt bike with real punch. "
        "Throttle, dust flying, guaranteed grin. Displacement and speed? Surprising for the size. "
        "But helmet and supervision are non-negotiable — no fun without safety. "
        "Honest test, not influencer hype. More at emobilist USA."
    ),
    "DE-03": (
        "Fatbike — aber nicht nur fett. TST Nullzwei: Akku, Motor, Reifen im Detail. "
        "Beschleunigung hat Punch, aber Handling ist schwerer als gedacht. "
        "Reichweite im Alltag? Realistisch, nicht Marketing. "
        "Für wen lohnt sich das? Ehrliche Antwort am Ende. Mehr bei the emobilist."
    ),
    "EN-03": (
        "Fat bike — but not just fat tires. TST Zero Two: battery, motor, tires up close. "
        "Acceleration has punch, but handling is heavier than you'd think. "
        "Real-world range? Realistic, not marketing. "
        "Who is this actually for? Honest answer at the end. More at emobilist USA."
    ),
    "DE-04": (
        "Klapprad — aber wie schnell? Vitilan V3: Scharnier, Akku, Straßentest. "
        "Zusammenklappen in Sekunden — passt in den Kofferraum. "
        "Aber Tempo und Reichweite? Das überrascht. "
        "Deal oder Trap? Engineer sagt's ehrlich. Mehr bei the emobilist."
    ),
    "EN-04": (
        "Folding bike — but how fast? Vitilan V3: hinge, battery, street test. "
        "Folds in seconds — fits in the trunk. "
        "But speed and range? That surprises. "
        "Deal or trap? Engineer says it straight. More at emobilist USA."
    ),
    "DE-05": (
        "Amazon E-Bike für unter tausend Euro — Deal oder Trap? "
        "Invanti Tide Zwei: Scharnier, Akku, Fat Tire im Check. "
        "Klappmechanismus sieht solide aus — aber hält er? "
        "Straßentest zeigt die Wahrheit. Ehrliches Urteil, kein Affiliate-Hype. "
        "Mehr Tests bei the emobilist."
    ),
    "EN-05": (
        "Amazon e-bike under a thousand bucks — deal or trap? "
        "Invanti Tide Two: hinge, battery, fat tire check. "
        "Folding mechanism looks solid — but does it hold? "
        "Street test shows the truth. Honest verdict, no affiliate hype. "
        "More tests at emobilist USA."
    ),
    "DE-06": (
        "Warte ab — bis der Blinker wirklich feuert. Lumos Helm: Box, Remote, LEDs. "
        "L und R am Remote — Blinker ohne Handzeichen. "
        "Firefly an: LEDs leuchten. Das ist der Beweis, nicht die Behauptung. "
        "Nachts gewinnt Sichtbarkeit. Ehrlicher Helm-Test. Mehr bei the emobilist."
    ),
    "EN-06": (
        "Wait for it — until the blinker actually fires. Lumos helmet: box, remote, LEDs. "
        "L and R on the remote — turn signals without hand waves. "
        "Firefly on: LEDs glow. That's the proof, not the claim. "
        "At night, visibility wins. Honest helmet test. More at emobilist USA."
    ),
}

PHASES_8 = [
    {"phase": "STOP", "max_sec": 2.0},
    {"phase": "CURIOSITY", "max_sec": 2.5},
    {"phase": "ESCALATION", "max_sec": 2.5},
    {"phase": "ESCALATION", "max_sec": 2.5},
    {"phase": "ESCALATION", "max_sec": 2.5},
    {"phase": "ESCALATION", "max_sec": 2.5},
    {"phase": "PAYOFF", "max_sec": 2.5},
    {"phase": "LOOP", "max_sec": 2.0},
]


def condense_story(v5_story: dict) -> dict:
    """Reduce 12-13 beats to 8 punchy beats."""
    hook = v5_story["hook"]
    beats = v5_story["beats"]
    cta = v5_story["cta"]
    loop = v5_story.get("loop", "")
    vp = v5_story["visual_plan"]
    kws = v5_story.get("keywords") or []

    # Pick 6 beats from middle (evenly spaced)
    n_beats = len(beats)
    if n_beats > 6:
        indices = [int(i * (n_beats - 1) / 5) for i in range(6)]
        selected_beats = [beats[i] for i in indices]
        selected_vp = [vp[min(i + 1, len(vp) - 1)] for i in indices]
        selected_kws = [kws[min(i + 1, len(kws) - 1)] if i + 1 < len(kws) else [] for i in indices]
    else:
        selected_beats = beats[:6]
        selected_vp = vp[1 : 1 + len(selected_beats)]
        selected_kws = kws[1 : 1 + len(selected_beats)]

    # 8 total: hook + 5 escalation + payoff + loop/cta
    new_captions = [hook] + selected_beats[:5] + [beats[-2] if len(beats) > 2 else cta, loop or cta]
    new_vp = [vp[0]] + selected_vp[:5] + [vp[-2] if len(vp) > 2 else vp[-1], vp[-1]]
    new_kws = [kws[0] if kws else []] + selected_kws[:5] + [
        kws[-2] if len(kws) > 2 else [],
        kws[-1] if kws else [],
    ]

    # Trim to 8
    new_captions = new_captions[:8]
    new_vp = new_vp[:8]
    new_kws = new_kws[:8]
    while len(new_vp) < len(new_captions):
        new_vp.append(vp[-1])
    while len(new_kws) < len(new_captions):
        new_kws.append([])

    return {
        "hook": new_captions[0],
        "beats": new_captions[1:-2],
        "cta": cta,
        "loop": loop,
        "structure": PHASES_8[: len(new_captions)],
        "keywords": new_kws,
        "visual_plan": new_vp,
    }


def main():
    themes = {}
    for sid, cfg in V5["themes"].items():
        story = condense_story(cfg["story"])
        themes[sid] = {
            **{k: v for k, v in cfg.items() if k != "story"},
            "story": story,
            "vo_script": VO_SCRIPTS.get(sid, " ".join(cfg["story"].get("vo") or [])),
        }

    out = {
        "version": "v6",
        "playbook": "STOP → CURIOSITY → ESCALATION → PAYOFF → LOOP",
        "rules": {
            "hook_max_sec": 2.0,
            "beat_max_sec": 2.5,
            "target_sec_ideal": [28, 35],
            "karaoke_captions": True,
            "quality_gate_min_score": 7.0,
            "privacy_default": "unlisted",
        },
        "themes": themes,
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {OUT} with {len(themes)} themes")


if __name__ == "__main__":
    main()
