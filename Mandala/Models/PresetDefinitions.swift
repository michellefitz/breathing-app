import Foundation

struct KaleidoscopePreset {
    let name: String
    let hue: Double
    let colorShift: Double
    let saturation: Double
    let brightness: Double
    let bgColor: String        // hex e.g. "#04020a"
    let style: String
    let lineWidth: Double
    let glowAmount: Double
    let colorSpread: Double
}

let ALL_PRESETS: [KaleidoscopePreset] = [
    // Deep violet + pink
    KaleidoscopePreset(name: "starseeds",  hue: 280, colorShift: 20,  saturation: 1.00, brightness: 1.00, bgColor: "#04020a", style: "mandala",   lineWidth: 1.0, glowAmount: 1.2, colorSpread: 1.2),
    // Electric cyan + magenta
    KaleidoscopePreset(name: "aurora",     hue: 195, colorShift: 25,  saturation: 1.05, brightness: 1.00, bgColor: "#020a0a", style: "mandala",   lineWidth: 1.0, glowAmount: 1.0, colorSpread: 1.0),
    // Fire — deep red to gold
    KaleidoscopePreset(name: "fire",       hue: 8,   colorShift: 10,  saturation: 1.10, brightness: 1.00, bgColor: "#0a0200", style: "neon",      lineWidth: 1.5, glowAmount: 1.8, colorSpread: 0.8),
    // Rainbow — full spectrum spin
    KaleidoscopePreset(name: "rainbow",    hue: 0,   colorShift: 60,  saturation: 1.00, brightness: 1.00, bgColor: "#03030a", style: "prism",     lineWidth: 0.8, glowAmount: 0.8, colorSpread: 2.5),
    // Emerald green + teal
    KaleidoscopePreset(name: "forest",     hue: 140, colorShift: 15,  saturation: 0.95, brightness: 0.95, bgColor: "#010a03", style: "lotus",     lineWidth: 1.0, glowAmount: 1.0, colorSpread: 0.9),
    // Soft blue-white — ice/crystal
    KaleidoscopePreset(name: "ice",        hue: 210, colorShift: 8,   saturation: 0.75, brightness: 1.10, bgColor: "#020408", style: "sacred",    lineWidth: 0.7, glowAmount: 0.6, colorSpread: 0.5),
    // Deep indigo spiral arms — galaxy
    KaleidoscopePreset(name: "galaxy",     hue: 245, colorShift: 12,  saturation: 1.00, brightness: 1.00, bgColor: "#01010a", style: "spiral",    lineWidth: 1.2, glowAmount: 1.4, colorSpread: 1.5),
    // Teal dreamcatcher web
    KaleidoscopePreset(name: "dreamweb",   hue: 175, colorShift: 10,  saturation: 0.85, brightness: 1.05, bgColor: "#010a08", style: "web",       lineWidth: 0.8, glowAmount: 0.8, colorSpread: 0.8),
    // Sapphire-gold cut gem
    KaleidoscopePreset(name: "gem",        hue: 220, colorShift: 5,   saturation: 1.10, brightness: 1.10, bgColor: "#010208", style: "crystal",   lineWidth: 1.0, glowAmount: 1.0, colorSpread: 1.8),
    // Rose-gold silk ribbons
    KaleidoscopePreset(name: "silk",       hue: 340, colorShift: 18,  saturation: 0.90, brightness: 1.05, bgColor: "#0a0104", style: "ribbons",   lineWidth: 1.4, glowAmount: 1.2, colorSpread: 1.0),
    // Electric white starburst
    KaleidoscopePreset(name: "nova",       hue: 55,  colorShift: 30,  saturation: 1.10, brightness: 1.10, bgColor: "#08080a", style: "starburst", lineWidth: 0.9, glowAmount: 1.6, colorSpread: 2.0),
    // Cyan-purple vortex whirlpool
    KaleidoscopePreset(name: "whirlpool",  hue: 190, colorShift: 22,  saturation: 1.00, brightness: 1.00, bgColor: "#010508", style: "vortex",    lineWidth: 1.3, glowAmount: 1.5, colorSpread: 1.3),
]
