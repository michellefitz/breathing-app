import SwiftUI

struct CompletionView: View {
    @Environment(SessionModel.self) var model

    var body: some View {
        ZStack {
            Color(red: 9/255, green: 8/255, blue: 12/255).ignoresSafeArea()

            // Ambient lavender glow
            RadialGradient(
                colors: [
                    Color(red: 168/255, green: 153/255, blue: 200/255).opacity(0.09),
                    .clear
                ],
                center: UnitPoint(x: 0.5, y: 0.25),
                startRadius: 0,
                endRadius: 220
            )
            .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                Spacer()

                // ── Content block ──────────────────────────────────────────
                VStack(alignment: .leading, spacing: 0) {
                    Text("SESSION COMPLETE")
                        .font(.custom("DMSans-Light", size: 10))
                        .tracking(2.8)
                        .foregroundStyle(Color(red: 168/255, green: 153/255, blue: 200/255))
                        .padding(.bottom, 24)

                    Text("Well\ndone.")
                        .font(.custom("CormorantGaramond-Light", size: 64))
                        .lineSpacing(2)
                        .tracking(-0.5)
                        .foregroundStyle(Color(red: 245/255, green: 241/255, blue: 235/255))
                        .padding(.bottom, 36)

                    Rectangle()
                        .frame(width: 32, height: 1)
                        .foregroundStyle(Color(white: 0.20))
                        .padding(.bottom, 28)

                    Text("You breathed for")
                        .font(.custom("CormorantGaramond-LightItalic", size: 18))
                        .foregroundStyle(Color(red: 118/255, green: 110/255, blue: 116/255))
                        .padding(.bottom, 8)

                    Text(formattedDuration)
                        .font(.custom("DMSans-Light", size: 42))
                        .tracking(-0.5)
                        .foregroundStyle(Color(red: 200/255, green: 192/255, blue: 182/255))
                }
                .padding(.horizontal, 36)

                Spacer()

                // ── Actions ────────────────────────────────────────────────
                VStack(spacing: 0) {
                    Button {
                        model.resetToIdle()
                    } label: {
                        Text("BEGIN AGAIN")
                            .font(.custom("DMSans-Regular", size: 13))
                            .tracking(2.2)
                            .foregroundStyle(Color(red: 168/255, green: 153/255, blue: 200/255))
                            .frame(maxWidth: .infinity)
                            .frame(height: 56)
                            .overlay(
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(Color(red: 168/255, green: 153/255, blue: 200/255).opacity(0.35), lineWidth: 1)
                            )
                    }

                    Button {
                        model.resetToIdle()
                    } label: {
                        Text("CLOSE")
                            .font(.custom("DMSans-Light", size: 11))
                            .tracking(1.8)
                            .foregroundStyle(Color(white: 0.22))
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                    }
                    .padding(.top, 4)
                }
                .padding(.horizontal, 36)
                .padding(.bottom, 62)
            }
        }
        .preferredColorScheme(.dark)
    }

    private var formattedDuration: String {
        let total = Int(model.elapsedSeconds)
        let m = total / 60
        let s = total % 60
        return m > 0 ? "\(m) min \(s) sec" : "\(s) sec"
    }
}
