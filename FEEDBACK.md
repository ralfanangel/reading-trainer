# Luma Reads — validation loops (≥10)

Honest feedback from a separate cloud validation instance, local reviewers, UI tests, and automated smoke tests.

## Round 1 — local product review
**Issues:** nonsense sight stories; silent-e on high-frequency words; emoji Pip; soft aloud path; hard random bank; ambiguous pictures; missing giggle; HUD on welcome.
**Changes:** sentence stories, magic-e exceptions, layered Pip, easier banks, cleaner pictures, giggle, testids.

## Round 2 — computerUse UI
**Issues:** welcome form flaky under automation.
**Changes:** `data-testid`, startBtn backup, `__lumaBegin` helpers, Playwright harness.

## Round 3 — cloud validation instance
**Issues:** kid UX gaps; needed larger taps, countdown, soft session end, CSS Pip, vowel-team underlines, readable surprises.
**Changes (`1b4b55b`):** Dolch bank, digraph+team bars, story frames, bigtap, CSS Pip, countdown + “I'm done”, word HUD, cheers.

## Round 4 — merge harden
**Issues:** picture a11y labels; silent-e on `are`/`one`; welcome HUD vs brand.
**Changes:** word aria-labels + testids; silent-e exceptions; hide HUD on welcome.

## Round 5 — harsh product review
**Issues:** phonics bars on irregulars; broken stories; Home skips surprise; Pip idle; emoji lies; weak welcome value prop.
**Changes:** heart-word single underline in sight; short repeated-word stories; Home confirm → surprise; Pip welcome line; cup/jam/log fixes; Grade‑1 hero copy.

## Round 6 — first-grade teacher review
**Issues:** decodable words mixed as “sight”; underlines teach wrong strategies; flat difficulty; legend mismatch; stories not useful rereading.
**Changes:** HEART_WORDS set; sight coach = “say the whole word”; tiered picture banks A/B/C; distractors from same tier; legend “digraphs/teams”; Pip tip updated; reread frames with word repetition.

## Round 7 — Playwright smoke (automated)
**Result:** ALL PASS — welcome → Mia → heart underline → points → wrong/right picture → surprise → buddy bubble; grapheme unit checks for `are`/`cake`/`ship`.

## Round 8–10 — additional critique + polish passes
See continuing notes from follow-up review agents and UI walkthrough.

## Round 8 — post-heart review
**Issues:** decodables still shown as heart; homophone mic aliases; browser confirm; naming mismatch; picture story weak.
**Changes:** heart-only bank; exact short-word speech; in-app leave modal; “Heart Words” naming; stronger picture reread frames.

## Round 9 — visual/UX review
**Issues:** duplicate Pip on welcome; hero-sub clutter; small+bigtap conflict; short viewport clip; stacked motion.
**Changes:** hide header Pip on welcome; drop hero-sub; bigtap wins; short-height media query; quieter welcome animations.

## Round 10 — final validation + smoke
**Result:** Playwright ALL PASS after leave-modal path. Ready for UI walkthrough.
