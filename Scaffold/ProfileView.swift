import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var profileStore: ProfileStore
    @State private var name: String = ""

    var body: some View {
        VStack(spacing: 20) {
            Text("Welcome!")
                .font(.title)
            Text("What's your name?")

            TextField("Your name", text: $name)
                .textFieldStyle(RoundedBorderTextFieldStyle())
                .padding(.horizontal)

            Button(action: {
                let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { return }
                profileStore.save(name: trimmed)
            }) {
                Text("Start")
                    .bold()
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color.green)
                    .foregroundColor(.white)
                    .cornerRadius(10)
                    .padding(.horizontal)
            }

            Spacer()
        }
        .padding()
    }
}
