import Foundation

struct Animal: Codable, Identifiable {
    var id: String
    var name: String
    var symbol: String?
}

final class AnimalsLoader {
    static func load() -> [Animal] {
        guard let url = Bundle.main.url(forResource: "animals", withExtension: "json") else {
            return []
        }
        if let data = try? Data(contentsOf: url), let arr = try? JSONDecoder().decode([Animal].self, from: data) {
            return arr
        }
        return []
    }
}
