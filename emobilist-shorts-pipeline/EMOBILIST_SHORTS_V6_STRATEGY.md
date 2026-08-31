# EMOBILIST Shorts V6 — Qualitäts-Upgrade Strategie

**Status:** V6 in Entwicklung (Ziel: 8+/10 statt aktuell ~3/10)  
**Binding Playbook:** `EMOBILIST_VIRAL_SHORTS_PLAYBOOK.md`

---

## Warum V5 immer noch ~3/10 ist

| Problem | Ursache in V5 | Impact |
|---------|---------------|--------|
| **Roboter-Stimme** | edge-tts (ConradNeural/AndrewNeural) — klingt wie TikTok-Bot, nicht wie Ralf | 🔴 Kritisch |
| **Keine Karaoke-Captions** | Phrase-level ASS, nicht word-by-word | 🔴 Kritisch |
| **Zu lang / zu viele Beats** | 13 Beats à 3s = 38s — fühlt sich langsam an trotz Struktur | 🟠 Hoch |
| **Kein Sounddesign** | Nur Musik-Bed, keine Whoosh/Impact bei Schnitten | 🟠 Hoch |
| **Flache Bildsprache** | Zoom nur im Hook, keine Kontrast/Sättigung | 🟡 Mittel |
| **Choppy VO** | 13 einzelne TTS-Zeilen statt fließender Erzählung | 🟠 Hoch |

Technisch erfüllt V5 die Checkliste (Hook ≤2s, Beats ≤3s, Struktur-Marker) — aber **fühlt sich nicht viral an**, weil Stimme, Captions und Pacing die wichtigsten Retention-Hebel nicht treffen.

---

## V6 Lösungen (nach Viral-Shorts-Forschung 2025/2026)

### 1. Ralfs echte Stimme (ElevenLabs) — größter Hebel
- **Problem:** edge-tts klingt steril/fremd
- **Lösung:** ElevenLabs Voice Clone mit Ralfs Stimme
- **Fallback:** edge-tts KillianNeural (DE) / GuyNeural (EN) — tiefer, weniger TikTok
- **Env:** `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`

### 2. Word-by-word Karaoke-Captions
- **Problem:** 80%+ schauen ohne Sound — statische Phrasen halten nicht
- **Lösung:** faster-whisper → Wort-Timestamps → ASS Karaoke (`{\k}` Tags)
- **Format:** 2–3 Wörter pro Gruppe, aktives Wort cyan-highlighted
- **Research:** Caption Animation bei 78.6% der viralen Clips (Opus Pro, 13.5M Clips)

### 3. Schnellere Schnitte (≤2.5s statt 3s)
- **Problem:** 3s pro Beat = zu statisch für Shorts-Algorithmus
- **Lösung:** `BEAT_MAX_SEC = 2.5`, Ziel-Länge 28–35s, max 8 Beats
- **Research:** Visueller Wechsel alle 1.5–2.5s (Vortex Xcel, ScaleLab 2026)

### 4. Durchgehendes Voiceover
- **Problem:** 13 einzelne TTS-Snippets klingen abgehackt
- **Lösung:** Ein `vo_script` pro Short, ein Audio-File, Whisper-Alignment
- **Ton:** Engineer in Kalifornien — klar, trocken, neugierig (Playbook)

### 5. Sounddesign bei Schnitten
- **Problem:** Nur Musik-Bed, kein rhythmisches Feedback
- **Lösung:** Whoosh/Impact-SFX bei jedem Cut (aus Synology `/FX_Sound/` oder generiert)
- **Mix:** VO dominant, Musik -10dB unter VO, Original-Sound bei Fahrgeräuschen

### 6. Visuelles Punch-Editing
- Zoom-Punch im Hook + Escalation-Beats
- Leichte Kontrast/Sättigung-Boost (`eq=contrast=1.08`)
- Loop-Ende: letzter Beat = erster Clip (Rewatch-Signal)

### 7. Automatisches Quality Gate
- Score 0–10 vor Upload
- **Minimum 7.0** für Upload (sonst Blocker-Liste)
- Gewichtung: Stimme (2.0), Karaoke (1.5), Hook-Pace (1.5), Beat-Pace (1.5)

---

## V6 vs V5 Vergleich

| Bereich | V5 | V6 |
|---------|----|----|
| Stimme | edge-tts pro Beat | ElevenLabs continuous + Fallback |
| Captions | Phrase ASS | Word-by-word Karaoke |
| Beats | 12–13 × 3s | 8 × 2.5s |
| Länge | ~38s | ~28–35s |
| SFX | Keine | Whoosh bei Cuts |
| Quality Gate | Retention-Checklist | Score 0–10, min 7.0 |
| Pipeline-Pfad | `/tmp/` (ephemeral) | `emobilist-shorts-pipeline/data/` (persistent) |

---

## Nächste Schritte

1. **Credentials** (blockiert Render + Upload):
   - `SYNOLOGY_PASSWORD` — RAW, Musik, SFX
   - `ELEVENLABS_API_KEY` — Ralf Voice Clone
   - `YOUTUBE_OAUTH_DE` / `YOUTUBE_OAUTH_USA` — unlisted Upload

2. **Pilot DE-01** rendern → Ralf-Freigabe → dann alle 12

3. **Nicht publishen** — nur unlisted, Ralf veröffentlicht selbst

---

## Pipeline-Befehle

```bash
cd emobilist-shorts-pipeline
pip install -r requirements.txt
python3 setup_nas.py                    # RAW + Musik von NAS
python3 generate_v6_templates.py        # V6 Scripts generieren
python3 rebuild_pilots_v6.py --id DE-01 # Ein Pilot
python3 rebuild_pilots_v6.py --all --upload  # Alle 12 + Upload
```

## ⛔ Sicherheit
Siehe `YOUTUBE_DELETE_SAFETY.md` — nie fremde Videos löschen, viewCount > 3 = nicht löschen.
