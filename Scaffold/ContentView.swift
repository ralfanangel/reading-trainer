import SwiftUI

struct ContentView: View {
    @EnvironmentObject var profileStore: ProfileStore

    var body: some View {
        NavigationView {
            if profileStore.currentProfile == nil {
                ProfileView()
            } else {
                MainMenuView()
            }
        }
    }
}

struct MainMenuView: View {
    @EnvironmentObject var profileStore: ProfileStore

    var body: some View {
        VStack(spacing: 24) {
            Text("Hi, \(profileStore.currentProfile?.name ?? "")!")
                .font(.largeTitle)
                .padding()

            NavigationLink(destination: AnimalsGameView()) {
                HStack {
                    Image(systemName: "pawprint.fill")
                    Text("Animals Game")
                }
                .padding()
                .background(Color.blue.opacity(0.2))
                .cornerRadius(12)
            }

            Spacer()
        }
        .navigationTitle("Reading Trainer")
        .padding()
    }
}
