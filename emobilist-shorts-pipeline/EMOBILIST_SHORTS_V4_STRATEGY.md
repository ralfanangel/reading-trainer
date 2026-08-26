# EMOBILIST Shorts V4 — Visual-Text Alignment

## Ralf feedback (V3)
- Caption size OK (keep FontSize≈56 / PlayRes 1080×1920) — do not enlarge.
- Picture ≠ text (e.g. “Blinker-Helm” over kid’s legs).
- Same music bed reused across Shorts.

## V4 fixes
1. **Beat timeline**: each caption interval is paired with a clip whose curated vision tags match the claim (`need` list in `visual_plan`).
2. **Curated tags** from frame grabs + OpenCV heuristics (`build_short_v4.py` CURATED + `analyze_frame_tags`).
3. **Rewrite or skip**: if no matching RAW exists, caption is rewritten to available visuals (never leave a mismatch).
4. **Music variance**: 6 distinct AlumoMusic beds from Synology `Schnitt/Musik` — one per theme (DE/EN share).
5. **Evidence**: per-beat frame grabs labeled with caption text under `/opt/cursor/artifacts/v4_*`.

## Spot checks
- Lumos: blinker remote L/R, helmet with blinker module (top-band crop), Firefly lights on, packaging SIGNALS.
- Vitilan: actual fold / folded bike on garage floor.
- Onewheel: street ride + board detail (no fake beach if footage isn’t beach).

## Pipeline
- `build_short_v4.py` — beat→clip matcher + music path
- `rebuild_pilots_v4.py` — 12 pilots, private schedule DE 15:00Z / USA 22:00Z
