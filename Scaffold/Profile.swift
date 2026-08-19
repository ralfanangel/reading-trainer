import Foundation
import Combine

final class Profile: Codable, Identifiable {
    var id: UUID = UUID()
    var name: String
    init(name: String) { self.name = name }
}

final class ProfileStore: ObservableObject {
    @Published var currentProfile: Profile?
    private let key = "reading_trainer_profile"

    init() {
        load()
    }

    func save(name: String) {
        let p = Profile(name: name)
        currentProfile = p
        if let data = try? JSONEncoder().encode(p) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    func load() {
        if let data = UserDefaults.standard.data(forKey: key),
           let p = try? JSONDecoder().decode(Profile.self, from: data) {
            currentProfile = p
        }
    }
}
