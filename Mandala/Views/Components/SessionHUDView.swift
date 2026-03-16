import SwiftUI

/// Minimal HUD: elapsed time + End Session button.
/// Visible only when tapped.
struct SessionHUDView: View {
    let elapsedSeconds: Double
    let onEnd: () -> Void
    @Binding var isVisible: Bool

    var body: some View {
        VStack {
            HStack {
                Text(formattedTime)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(ColorPalette.hudText)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(ColorPalette.hudBackground)
                    .clipShape(Capsule())

                Spacer()

                Button {
                    onEnd()
                } label: {
                    Text("End Session")
                        .font(.system(.caption, design: .rounded, weight: .medium))
                        .foregroundStyle(ColorPalette.hudText)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(ColorPalette.hudBackground)
                        .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 60)

            Spacer()
        }
        .opacity(isVisible ? 1 : 0)
        .animation(.easeInOut(duration: 0.3), value: isVisible)
    }

    private var formattedTime: String {
        let total = Int(elapsedSeconds)
        let m = total / 60
        let s = total % 60
        return String(format: "%d:%02d", m, s)
    }
}
