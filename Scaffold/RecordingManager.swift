import Foundation
import Speech

/// Recording & speech-recognition helper (placeholder)
/// Note: You must add the `NSSpeechRecognitionUsageDescription` and
/// `NSMicrophoneUsageDescription` keys to Info.plist when you integrate into an Xcode project.
final class RecordingManager: ObservableObject {
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()

    func requestPermissions(completion: @escaping (Bool) -> Void) {
        SFSpeechRecognizer.requestAuthorization { auth in
            DispatchQueue.main.async {
                completion(auth == .authorized)
            }
        }
    }

    func startRecognition(resultHandler: @escaping (String) -> Void) throws {
        guard let recognizer = recognizer, recognizer.isAvailable else { throw NSError(domain: "Speech", code: -1) }
        request = SFSpeechAudioBufferRecognitionRequest()
        let input = audioEngine.inputNode
        let recordingFormat = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { (buffer, _) in
            self.request?.append(buffer)
        }
        audioEngine.prepare()
        try audioEngine.start()
        task = recognizer.recognitionTask(with: request!) { result, error in
            if let r = result, r.isFinal {
                resultHandler(r.bestTranscription.formattedString)
            }
            if error != nil {
                self.stopRecognition()
            }
        }
    }

    func stopRecognition() {
        audioEngine.stop()
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
    }
}
