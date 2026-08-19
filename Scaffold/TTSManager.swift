import Foundation
import AVFoundation

final class TTSManager: NSObject, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private var audioPlayer: AVAudioPlayer?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    /// Speak a short phrase or word. Prefer a local recorded voice pack when available.
    /// Voice pack layout (bundle resource): VoicePack/Words/<word>.mp3 and VoicePack/Phrases/<slug>.mp3
    func speak(text: String) {
        // Try local voice files first. Normalize the text to a filename-friendly form.
        let normalized = normalize(text: text)

        // Try words (single-word match)
        if let wordURL = localResourceURL(subdirectory: "VoicePack/Words", name: normalized + ".mp3") {
            playLocalAudio(url: wordURL)
            return
        }

        // Try phrases
        if let phraseURL = localResourceURL(subdirectory: "VoicePack/Phrases", name: normalized + ".mp3") {
            playLocalAudio(url: phraseURL)
            return
        }

        // Fallback to on-device TTS
        let utter = AVSpeechUtterance(string: text)
        utter.voice = AVSpeechSynthesisVoice(language: "en-US")
        utter.rate = 0.48
        synthesizer.speak(utter)
    }

    private func playLocalAudio(url: URL) {
        do {
            audioPlayer = try AVAudioPlayer(contentsOf: url)
            audioPlayer?.prepareToPlay()
            audioPlayer?.play()
        } catch {
            // if playback fails, fallback to TTS
            let fallback = url.deletingPathExtension().lastPathComponent.replacingOccurrences(of: "_", with: " ")
            let utter = AVSpeechUtterance(string: fallback)
            utter.voice = AVSpeechSynthesisVoice(language: "en-US")
            utter.rate = 0.48
            synthesizer.speak(utter)
        }
    }

    private func localResourceURL(subdirectory: String, name: String) -> URL? {
        // Look in the app bundle first
        if let url = Bundle.main.url(forResource: name, withExtension: nil, subdirectory: subdirectory) {
            return url
        }
        // As a development convenience, also look in the top-level bundle (VoicePack/...)
        if let url = Bundle.main.url(forResource: name, withExtension: nil) {
            return url
        }
        return nil
    }

    private func normalize(text: String) -> String {
        // Lowercase, remove punctuation, replace spaces with underscores
        let lower = text.lowercased()
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: " _-"))
        let filtered = lower.unicodeScalars.filter { allowed.contains($0) }
        var s = String(String.UnicodeScalarView(filtered))
        s = s.replacingOccurrences(of: " ", with: "_")
        s = s.replacingOccurrences(of: "-", with: "_")
        return s
    }
}
