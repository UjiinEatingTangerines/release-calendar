import AppKit
import SwiftUI

@main
struct RenderMenu {
    @MainActor static func main() throws {
        _ = NSApplication.shared
        let folder = URL(fileURLWithPath: CommandLine.arguments[1])
        let summary = try JSONDecoder().decode(MenuSummary.self, from: Data(contentsOf: folder.appendingPathComponent("menu-api.json")))
        let projects = [Project(id: "demo", name: "Orbit · 가상 프로젝트", timezone: "Asia/Seoul")]
        let actions = PopoverActions(selectProject: { _ in }, openWeb: { _ in }, refresh: {}, settings: {}, help: {}, restart: {}, quit: {})
        for (name, scheme, height, data, message) in [
            ("menu-light", ColorScheme.light, 660.0, Optional(summary), Optional<String>.none),
            ("menu-dark", .dark, 660.0, Optional(summary), Optional<String>.none),
            ("menu-small", .light, 420.0, Optional(summary), Optional<String>.none),
            ("menu-empty", .light, 660.0, Optional<MenuSummary>.none, Optional("인증정보가 필요합니다. 설정을 확인해 주세요."))
        ] {
            let view = PopoverView(projects: projects, selected: "demo", mode: name == "menu-empty" ? "live" : "demo", summary: data,
                message: message, loading: false, ready: true, height: height, actions: actions)
                .environment(\.colorScheme, scheme)
            let hosting = NSHostingView(rootView: view)
            let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: Palette.width, height: height), styleMask: [.borderless], backing: .buffered, defer: false)
            window.appearance = NSAppearance(named: scheme == .dark ? .darkAqua : .aqua)
            window.contentView = hosting
            hosting.frame = NSRect(x: 0, y: 0, width: Palette.width, height: height)
            window.display(); hosting.layoutSubtreeIfNeeded()
            RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.2))
            guard let bitmap = hosting.bitmapImageRepForCachingDisplay(in: hosting.bounds) else { throw NSError(domain: "NativeRender", code: 1) }
            hosting.cacheDisplay(in: hosting.bounds, to: bitmap)
            guard let png = bitmap.representation(using: .png, properties: [:]) else { throw NSError(domain: "NativeRender", code: 2) }
            try png.write(to: folder.appendingPathComponent("\(name).png"))
        }
    }
}
