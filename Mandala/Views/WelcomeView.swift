import SwiftUI

struct WelcomeView: View {
    @Environment(SessionModel.self) var model

    var body: some View {
        ZStack {
            // Warm parchment background
            Color(red: 239/255, green: 236/255, blue: 231/255).ignoresSafeArea()

            // Subtle directional gradient for depth
            RadialGradient(
                colors: [
                    Color(red: 232/255, green: 226/255, blue: 218/255),
                    Color(red: 239/255, green: 236/255, blue: 231/255)
                ],
                center: UnitPoint(x: 0.65, y: 0.15),
                startRadius: 20,
                endRadius: 340
            )
            .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {

                // ── Top label ──────────────────────────────────────────────
                Text("BREATHING MEDITATION")
                    .font(.custom("DMSans-Light", size: 10))
                    .tracking(2.5)
                    .foregroundStyle(Color(red: 181/255, green: 175/255, blue: 168/255))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 62)
                    .padding(.horizontal, 36)

                Spacer()

                // ── Hero ───────────────────────────────────────────────────
                VStack(alignment: .leading, spacing: 0) {
                

                    Text("Prism")
                        .font(.custom("CormorantGaramond-Light", size: 88))
                        .tracking(-2)
                        .foregroundStyle(Color(red: 26/255, green: 23/255, blue: 20/255))
                        .lineLimit(1)
                }
                .padding(.horizontal, 36)

                // ── Rule + tagline ─────────────────────────────────────────
                VStack(alignment: .leading, spacing: 14) {
                    Rectangle()
                        .frame(width: 36, height: 1)
                        .foregroundStyle(Color(red: 200/255, green: 192/255, blue: 182/255))

                    Text("A living kaleidoscope,\nguided by your breath.")
                        .font(.custom("CormorantGaramond-LightItalic", size: 22))
                        .lineSpacing(5)
                        .foregroundStyle(Color(red: 74/255, green: 69/255, blue: 64/255))
                }
                .padding(.horizontal, 36)
                .padding(.top, 28)

                // ── Body copy ──────────────────────────────────────────────
                Text("Each session guides you through a four-count breath cycle — inhale, hold, exhale, rest. A kaleidoscope of light blooms and shifts in rhythm with each breath, giving your mind something beautiful to rest on.")
                    .font(.custom("DMSans-Light", size: 14))
                    .lineSpacing(7)
                    .tracking(0.1)
                    .foregroundStyle(Color(red: 140/255, green: 130/255, blue: 120/255))
                    .padding(.horizontal, 36)
                    .padding(.trailing, 12)
                    .padding(.top, 26)

                Spacer()

                // ── CTA ────────────────────────────────────────────────────
                VStack(spacing: 14) {
                    Button {
                        model.startSession()
                    } label: {
                        Text("BEGIN SESSION")
                            .font(.custom("DMSans-Regular", size: 13))
                            .tracking(2.2)
                            .foregroundStyle(Color(red: 239/255, green: 236/255, blue: 231/255))
                            .frame(maxWidth: .infinity)
                            .frame(height: 56)
                            .background(Color(red: 26/255, green: 23/255, blue: 20/255))
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }

                    Text("No account needed · Free to use")
                        .font(.custom("DMSans-Light", size: 11))
                        .tracking(0.6)
                        .foregroundStyle(Color(red: 181/255, green: 175/255, blue: 168/255))
                        .frame(maxWidth: .infinity)
                }
                .padding(.horizontal, 36)
                .padding(.bottom, 62)
            }
        }
        .preferredColorScheme(.light)
    }
}
