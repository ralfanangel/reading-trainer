import SwiftUI
import AVFoundation

struct AnimalsGameView: View {
    @State private var animals: [Animal] = AnimalsLoader.load()
    @State private var target: Animal?
    @State private var message: String = ""
    private let tts = TTSManager()

    var body: some View {
        VStack(spacing: 16) {
            if let target = target {
                Text("Find: \(target.name.capitalized)")
                    .font(.title)
                    .padding()
                Button(action: { tts.speak(text: target.name) }) {
                    Image(systemName: "speaker.wave.2.fill")
                        .font(.title)
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

            Text(message)
                .font(.headline)
                .foregroundColor(.purple)

            Spacer()
        }
        .navigationTitle("Animals")
        .onAppear(perform: startRound)
    }

    func startRound() {
        animals.shuffle()
        target = animals.first
        message = ""
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
}
