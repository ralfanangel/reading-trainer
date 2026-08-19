# Voice pack (native) — add recorded audio files for an offline natural voice

This folder contains instructions for integrating a short recorded voice pack into the native (iPad/Catalyst) app. The app will prefer local recordings when available and fall back to AVSpeechSynthesizer.

Recommended folder structure inside the app bundle (Xcode):

- VoicePack/
  - Words/
    - cat.mp3
    - dog.mp3
    - rabbit.mp3
    - ... (lowercase filenames, spaces replaced with underscores)
  - Phrases/
    - great_job.mp3        # phrase used for praise
    - try_again.mp3        # feedback for incorrect attempts
    - welcome.mp3          # greeting lines

Naming rules:
- Filenames should be lowercase, alphanumeric, with spaces replaced by underscores.
- File format: MP3 or AAC (m4a). Prefer 44.1 kHz, 16-bit, constant bitrate. Keep files short (0.5–3s) for UI phrases, and 0.3–1.2s for single words.

How to add the voice pack to the Xcode project:
1. Create a folder named `VoicePack` in your project navigator (right-click → Add Files to "..." and select the folder). Make sure "Copy items if needed" is checked and files are added to the app target.
2. Place your `Words/` and `Phrases/` mp3 files in that folder.
3. Build and run. The app will use the recorded files automatically when available.

Recording tips (if you will record lines):
- Use a quiet room and a good microphone (USB condenser or lavalier).
- Record at 44.1 kHz, 16-bit. Export to high-quality mp3 or AAC.
- Keep voice consistent (same actor, friendly, energetic, clear enunciation appropriate for ages 4–8).
- For words, record the isolated word only (no leading/trailing silence) and export lossless or high-quality compressed audio.

License & privacy:
- Ensure you have the rights to distribute any recorded voice files you include in the product.
- Storing recorded audio in the app bundle keeps everything offline and COPPA-friendly.
