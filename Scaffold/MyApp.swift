import SwiftUI

@main
struct ReadingTrainerApp: App {
    @StateObject var profileStore = ProfileStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(profileStore)
        }
    }
}
