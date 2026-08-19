# Scaffold README

This scaffold provides a minimal set of Swift source files you can drop into an Xcode SwiftUI App project to start the Reading Trainer app skeleton.

What is included
- MyApp.swift — the @main app entry
- ContentView.swift — the main navigation and menu
- Profile.swift / ProfileView.swift — simple local profile storage (UserDefaults)
- AnimalsModel.swift / animals.json — a tiny local content set and loader
- AnimalsGameView.swift — placeholder animals "find the animal" game
- TTSManager.swift — on-device AVSpeechSynthesizer usage
- RecordingManager.swift — placeholder for speech recognition (SFSpeechRecognizer)

How to use
1. Create a new Xcode project: App (iOS), Interface: SwiftUI, Lifecycle: SwiftUI App.
2. Copy the files from the `Scaffold/` folder into the project target.
3. Add `NSSpeechRecognitionUsageDescription` and `NSMicrophoneUsageDescription` to Info.plist with friendly messages.
4. Enable the Mac Catalyst target in the project settings to run on your Mac for testing.
5. Run the app — the first screen will ask for the child's name. Then open "Animals Game" to test TTS and placeholder gameplay.

Notes
- This scaffold is intentionally small and offline-first: all content is read from the bundled `animals.json`.
- Pronunciation scoring and a 3D avatar are future milestones.
- When you are ready to add audio recording and speech recognition, the `RecordingManager` is a starting point. You may want to adapt permissions and handling per Apple's guidelines.
