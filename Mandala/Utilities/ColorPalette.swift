import SwiftUI

enum ColorPalette {
    // MARK: - Background
    static let background = Color(hex: "#0D0F1A")

    // MARK: - Trace Colors (pastel rose / lavender / peach cycle)
    static let traceColors: [Color] = [
        Color(hex: "#F4A7B9"), // rose
        Color(hex: "#C3A8F0"), // lavender
        Color(hex: "#FFCBA4"), // peach
        Color(hex: "#A8D8EA"), // sky
        Color(hex: "#F9C5D1"), // blush
        Color(hex: "#B8E0D2"), // mint
        Color(hex: "#E8C5F0"), // lilac
        Color(hex: "#FFD6A5"), // apricot
    ]

    // MARK: - Dot & Glow
    static let dotCore = Color.white
    static let glowTint = Color(hex: "#C3A8F0") // lavender glow
    static let syncedGlow = Color(hex: "#F4A7B9") // rose when synced
    static let driftGlow = Color(hex: "#FFCBA4")  // peach when drifting

    // MARK: - UI
    static let hudText = Color(hex: "#E8E0F0").opacity(0.85)
    static let hudBackground = Color.black.opacity(0.4)
    static let buttonPrimary = Color(hex: "#C3A8F0")
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
