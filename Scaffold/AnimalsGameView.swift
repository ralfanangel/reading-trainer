import SwiftUI
import AVFoundation

struct AnimalsGameView: View {
    @State private var animals: [Animal] = AnimalsLoader.load()
    @State private var target: Animal?
    @State private var message: String = ""
    private let tts = TTSManager()

    // Recording / recognition
    @State private var recorder = RecordingManager()
    @State private var isRecording = false
    @State private var recognitionResult: String = ""

    var body: some View {
        VStack(spacing: 16) {
            if let target = target {
                Text("Find: \(target.name.capitalized)")
                    .font(.title)
                    .padding()
                HStack(spacing: 18) {
                    Button(action: { tts.speak(text: target.name) }) {
                        Image(systemName: "speaker.wave.2.fill")
                            .font(.title)
                    }

                    // Say-it button (native pronunciation check)
                    Button(action: { toggleRecording() }) {
                        HStack {
                            Image(systemName: isRecording ? "mic.fill" : "mic")
                            Text(isRecording ? "Listening..." : "Say it")
                        }
                        .padding(8)
                        .background(isRecording ? Color.red.opacity(0.9) : Color.blue.opacity(0.2))
                        .foregroundColor(isRecording ? Color.white : Color.primary)
                        .cornerRadius(8)
                    }
                }
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 16) {
                ForEach(animals) { a in
                    Button(action: { select(animal: a) }) {
                        VStack {
                            if let sym = a.symbol {
                                Image(systemName: sym)
                                    .resizable()
                                    .scaledToFit()
                                    .frame(height: 80)
                                    .padding()
                                    .background(Color.yellow.opacity(0.2))
                                    .cornerRadius(12)
                            } else {
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Color.yellow.opacity(0.2))
                                    .frame(height: 80)
                            }
                            Text(a.name.capitalized)
                        }
                    }
                }
            }
            .padding()

            VStack(spacing: 6) {
                Text(message)
                    .font(.headline)
                    .foregroundColor(.purple)

                if !recognitionResult.isEmpty {
                    Text("Heard: \(recognitionResult)")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()
        }
        .navigationTitle("Animals")
        .onAppear(perform: startRound)
    }

    func startRound() {
        animals.shuffle()
        target = animals.first
        message = ""
        recognitionResult = ""
        isRecording = false
    }

    func select(animal: Animal) {
        guard let t = target else { return }
        if animal.id == t.id {
            message = "Correct!"
            tts.speak(text: "Great job!")
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { startRound() }
        } else {
            message = "Try again"
            tts.speak(text: "Try again")
        }
    }

    func toggleRecording() {
        if isRecording {
            stopRecognition()
        } else {
            // request permissions and start
            recorder.requestPermissions { allowed in
                if allowed {
                    do {
                        try startRecognition()
                    } catch {
                        DispatchQueue.main.async {
                            message = "Recording not available"
                        }
                    }
                } else {
                    DispatchQueue.main.async {
                        message = "Microphone / Speech permission denied"
                    }
                }
            }
        }
    }

    func startRecognition() throws {
        isRecording = true
        recognitionResult = ""
        try recorder.startRecognition { transcript in
            DispatchQueue.main.async {
                self.isRecording = false
                self.recognitionResult = transcript
                evaluateSpeech(transcript: transcript)
                // stop the recorder explicitly
                self.recorder.stopRecognition()
            }
        }
    }

    func stopRecognition() {
        recorder.stopRecognition()
        isRecording = false
    }

    func evaluateSpeech(transcript: String) {
        guard let t = target else { return }
        let heard = transcript.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let expected = t.name.lowercased()
        // simple matching: exact or fuzzy contains
        if heard == expected || heard.contains(expected) || expected.contains(heard) {
            message = "Nice! You said \(t.name.capitalized)"
            tts.speak(text: "Nice! You said \(t.name)")
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { startRound() }
        } else {
            message = "I heard \(transcript). Try again or tap the speaker to hear the word."
            // gentle prompt only, no negative feedback
            tts.speak(text: "Try again")
        }
    }
}
