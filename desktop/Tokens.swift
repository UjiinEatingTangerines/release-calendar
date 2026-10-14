import SwiftUI

// Native surface contract is recorded in DESIGN.md §9.
enum Palette {
    static func adaptive(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let value = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
            return NSColor(srgbRed: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255, alpha: 1)
        })
    }
    static let muted = adaptive(0x626262, 0xAAAAAA)
    static let blue = adaptive(0x205EB8, 0x79AEFF)
    static let purple = adaptive(0x7442AA, 0xC0A0FF)
    static let amber = adaptive(0x8C5108, 0xF2BF63)
    static let teal = adaptive(0x187563, 0x6AC9B1)
    static let red = adaptive(0xB23939, 0xFF9393)
    static let action = Color(red: 36/255, green: 93/255, blue: 193/255)
    static let canvas = Color(nsColor: .windowBackgroundColor)
    static let card = Color(nsColor: .controlBackgroundColor)
    static let width: CGFloat = 388
    static let gutter: CGFloat = 16
    static let radius: CGFloat = 12
    static func tint(_ phase: String) -> Color {
        switch phase {
        case "planning": return teal
        case "development": return blue
        case "qa": return purple
        case "frozen": return amber
        case "past-scheduled-date": return red
        case "release", "planned": return teal
        default: return muted
        }
    }
    static func symbol(_ phase: String) -> String {
        switch phase {
        case "planning": return "list.bullet.clipboard"
        case "development": return "hammer"
        case "qa": return "checklist"
        case "frozen": return "lock"
        case "past-scheduled-date": return "exclamationmark.circle"
        case "release": return "calendar.badge.clock"
        case "planned": return "calendar"
        default: return "calendar.badge.questionmark"
        }
    }
}
struct StatusBadge: View {
    let text: String
    var color: Color = Palette.muted
    var symbol: String? = nil
    var body: some View {
        HStack(spacing: 4) {
            if let symbol { Image(systemName: symbol) }
            Text(text)
        }
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(color).padding(.horizontal, 8).padding(.vertical, 4)
        .background(color.opacity(0.1), in: Capsule())
        .accessibilityElement(children: .combine)
    }
}
struct SurfaceButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(12)
            .background(Palette.card.opacity(configuration.isPressed ? 0.65 : 1), in: RoundedRectangle(cornerRadius: Palette.radius))
            .overlay(RoundedRectangle(cornerRadius: Palette.radius).stroke(Color.primary.opacity(0.055), lineWidth: 0.5))
    }
}
struct ReleaseCard: View {
    let release: ReleaseSummary
    let open: () -> Void
    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(release.name).font(.system(size: 13, weight: .semibold)).foregroundStyle(.primary)
                            .multilineTextAlignment(.leading).lineLimit(2).help(release.name)
                        StatusBadge(text: phaseLabel(release.phase), color: Palette.tint(release.phase), symbol: Palette.symbol(release.phase))
                    }
                    Spacer(minLength: 0)
                    VStack(alignment: .trailing, spacing: 4) {
                        Text(countdown(release.daysUntilRelease)).font(.system(size: release.daysUntilRelease == nil ? 13 : 24, weight: .semibold, design: .rounded))
                            .monospacedDigit().foregroundStyle(countdownColor)
                        Text(release.releaseDate.map { String($0.dropFirst(5)).replacingOccurrences(of: "-", with: "/") } ?? "일정 미등록")
                            .font(.system(size: 11)).foregroundStyle(Palette.muted)
                    }.fixedSize()
                }
                if let deadline = release.nextDeadline {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.turn.down.right").foregroundStyle(Palette.muted)
                        Text(deadlineLabel(deadline.kind)).foregroundStyle(.primary)
                        Text(String(deadline.date.dropFirst(5)).replacingOccurrences(of: "-", with: "/")).monospacedDigit().foregroundStyle(Palette.muted)
                        Spacer(minLength: 0)
                        Text(deadline.source == "rule" ? "예상 일정" : "Jira").foregroundStyle(Palette.muted)
                    }.font(.system(size: 11))
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(SurfaceButton())
        .help("\(release.name) · 웹에서 티켓과 PR 보기")
        .accessibilityLabel("\(release.name), \(countdown(release.daysUntilRelease)), \(phaseLabel(release.phase)), 웹 상세 열기")
    }
    private var countdownColor: Color {
        guard let days = release.daysUntilRelease else { return Palette.muted }
        return days < 0 ? Palette.red : days <= 3 ? Palette.amber : .primary
    }
}
