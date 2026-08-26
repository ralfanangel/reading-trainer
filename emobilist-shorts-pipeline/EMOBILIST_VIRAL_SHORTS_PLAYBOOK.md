# EMOBILIST Viral Shorts Playbook (binding for V5+)

**Status:** BINDING for every Short remake / rebuild starting V5.  
**Channels:** `@the.emobilist` (DE) · `@emobilistusa` (USA)  
**Owner style:** Ralf — deutscher Ingenieur in Kalifornien. Honest, punchy, no TikTok-influencer voice.

---

## Canonical formula

**STOP → CURIOSITY → ESCALATION → PAYOFF → LOOP**  
*(Aufmerksamkeit → Neugier → Steigerung → Belohnung → Wiederholung)*

| Beat | DE | Job |
|------|----|-----|
| STOP | Aufmerksamkeit | First 1–2s kill the scroll. Hook + curiosity. No “Hey Leute, heute…”. |
| CURIOSITY | Neugier | Open loop / question. Delay the answer a few seconds. |
| ESCALATION | Steigerung | Mini tension curves: small result → new question → test → surprise. |
| PAYOFF | Belohnung | Answer the one question. Show the result, don’t only talk. |
| LOOP | Wiederholung | End beats that invite rewatch (echo hook / unresolved tease / CTA). |

---

## Hard rules

1. **First 1–2 seconds = everything.** Immediate hook. Style: “Das ist wahrscheinlich der dümmste E-Scooter…”, “Warte ab, bis du siehst, was bei 50 km/h passiert.”
2. **One Short = one idea.** Hook → tension → resolution. Single question answered.
3. **Show the interesting thing, don’t just talk about it.** Brutal accel / fold / blinker ON SCREEN before explaining. VO/captions react to what’s seen.
4. **Visual change every 1–3 seconds** (angle, B-roll, zoom, speed, text, detail, POV, SFX). Cuts serve story — not random jump cuts.
5. **Open loop early; delay answer** a few seconds.
6. **Middle never boring:** Hook → small result → new question → test → surprise → final result (multiple mini tension curves).
7. **Cut ruthlessly.** Feel almost too fast. Ideal **30–45s** (hard cap ≤60).
8. **Captions mandatory** (many watch muted): short punchy blocks + **keyword highlight** (color/bold/outline).  
   **Keep captions SMALL** — FontSize≈56 ASS, PlayRes 1080×1920, lower-third ~5%. Do **not** revive giant top text. Emphasize with color/bold, never size bloat.
9. **Voice:** Prefer Ralf’s real voice / personality from RAW when available. Else punchy captions + original ride/product sound. No sterile AI TikTok voice. Reflect engineer tone.
10. **Music only as support.** Don’t drown VO or vehicle sounds (motor, tires, accel). Prefer Voice + original sound + few SFX over loud trending beds. **Music variance** across shorts (V4 rule). Duck music under VO / ride peaks.
11. **Visual-text match (V4 hard rule stays):** every caption beat must match what’s on screen. Analyze frames; rewrite caption or swap clip — never mismatch.
12. **Unlisted first:** uploads default `privacyStatus=unlisted` for Ralf’s review — not private+scheduled, not public until he says so.
13. **No face without real voice.** If faceless / no Ralf VO → headless / product-first framing.

---

## Ideal 30–45s structure

| t (s) | Phase | What happens |
|------:|-------|--------------|
| 0–2 | STOP | Hook visual + curiosity line |
| 2–5 | Proof | Show the claim happening |
| 5–10 | Curiosity twist | Open loop / “wait for it” |
| 10–20 | Test + B-roll | Multiple mini cuts ≤3s |
| 20–30 | Escalation | Raise stakes / surprise |
| 30–38 | Payoff | Answer the one question |
| 38–42 | Loop | Echo hook / CTA / rewatch bait |

Shorter RAW? Compress proportionally; never stretch with filler.

---

## Retention checklist (run before every upload)

- [ ] Hook lands in ≤2.0s (no greeting / no channel intro)
- [ ] One clear question; answered by payoff
- [ ] Open loop planted by ~5–10s
- [ ] Every beat ≤3.0s visual change
- [ ] Caption ↔ frame match verified (evidence grab per beat)
- [ ] Captions: FontSize≤56, lower-third, keyword highlight only (no size bloat)
- [ ] Music quieter under ride/VO; distinct bed vs recent shorts
- [ ] Original product/ride sound audible where it matters
- [ ] Duration 30–45s ideal (≤60)
- [ ] No face unless real Ralf VO present
- [ ] Upload = **unlisted** (no publishAt unless Ralf requested schedule)
- [ ] Ending invites loop / CTA without killing pace

---

## EMOBILIST adaptations

### Channels
- **DE:** German captions, CTA `@the.emobilist`, engineer tone (klar, trocken, neugierig).
- **USA:** English captions, CTA `@emobilistusa`, same personality — not US influencer slang.

### RAW-first
1. Prefer Synology / local RAW clips with curated vision tags.
2. Extract real VO from RAW when Ralf speaks on camera/mic.
3. If no usable VO → caption-led + original sound (motor, fold click, blinker beep, tire).

### Face / VO policy
- Face OK only with real Ralf voice (or explicit allow).
- Otherwise: product, POV, hands, board/bike, workshop — headless crops as needed.

### Captions
- ASS PlayRes 1080×1920, FontSize=56, MarginV lower-third.
- Keyword style: yellow/cyan highlight + bold on 1–3 key words per beat (`{\c&H00E5FF&}{\b1}…{\b0}{\c}`).
- Short lines (≤~22 chars soft wrap). Never full paragraph transcripts.

### Music
- One distinct bed per theme (DE/EN may share theme bed).
- Base music ~0.08–0.12; duck further under ride peaks / VO windows.
- Prefer original sound mix when demo depends on sound (accel, blinker, fold).

### Unlisted-first publish
```text
upload_short(..., privacy_status="unlisted", publish_at=None)
```
Public / schedule only after Ralf approval.

---

## Pipeline pointers (V5)

- Playbook (this file): `/opt/cursor/artifacts/EMOBILIST_VIRAL_SHORTS_PLAYBOOK.md`
- Strategy: `/opt/cursor/artifacts/EMOBILIST_SHORTS_V5_STRATEGY.md`
- Builder: `/tmp/shorts_pipeline/build_short_v5.py`
- Templates: `/tmp/shorts_pipeline/v5_story_templates.json`
- Upload: `/tmp/shorts_pipeline/upload_short.py` (default unlisted)
- Resume: `/opt/cursor/artifacts/SHORTS_RESUME.md`

## ⛔ HARD SAFETY — NEVER DELETE

Never delete non-agent channel content. Never delete videos with viewCount > 3. See `/opt/cursor/artifacts/YOUTUBE_DELETE_SAFETY.md`.
