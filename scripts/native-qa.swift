import AppKit
import WebKit

@main
struct NativeQA {
    @MainActor static func waitFor(_ condition: () -> Bool) async throws {
        for _ in 0..<100 {
            if condition() { return }
            try await Task.sleep(for: .milliseconds(50))
        }
        throw NSError(domain: "NativeQA.timeout", code: 1)
    }
    @MainActor static func check(_ condition: Bool, _ name: String) throws {
        if !condition { throw NSError(domain: name, code: 1) }
    }
    @MainActor static func text(_ web: WKWebView, _ script: String) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            web.evaluateJavaScript(script) { value, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: value as? String ?? "") }
            }
        }
    }
    @MainActor static func main() {
        let app = NSApplication.shared; app.setActivationPolicy(.accessory)
        let delegate = AppDelegate(); app.delegate = delegate
        Task { @MainActor in
            do {
                try await waitFor { delegate.summary != nil && !delegate.loading }
                delegate.chooseProject("demo")
                try await waitFor { delegate.summary?.project == "demo" && !delegate.loading }
                try check(delegate.summary?.totalPending == 4, "native-loaded-releases")
                delegate.togglePopover()
                try check(delegate.popover.isShown, "popover-opened")
                delegate.popover.performClose(nil)
                try await waitFor { !delegate.loading }
                delegate.chooseProject("empty")
                try await waitFor { delegate.summary?.project == "empty" && !delegate.loading }
                try check(delegate.summary?.dataAsOf == nil && delegate.summary?.totalPending == 0, "empty-project-switch")
                delegate.chooseProject("demo")
                try await waitFor { delegate.summary?.project == "demo" && !delegate.loading }
                delegate.refreshData()
                try await waitFor { !delegate.loading }
                try check(delegate.summary?.warnings.contains("jira:CREDENTIAL_MISSING") == true && delegate.summary?.totalPending == 4, "failed-sync-keeps-data")
                guard let release = delegate.summary?.releases.first, let link = delegate.webURL(release), let original = delegate.backend.url else {
                    throw NSError(domain: "NativeQA.webLinkMissing", code: 1)
                }
                let query = URLComponents(url: link, resolvingAgainstBaseURL: false)?.queryItems ?? []
                try check(query.contains(URLQueryItem(name: "project", value: "demo")) && query.contains(URLQueryItem(name: "release", value: release.releaseId)), "web-project-release-routing")
                delegate.openSettings()
                guard let settings = NSApp.windows.first(where: { $0.title == "연결 설정 · Release Calendar" }), let web = settings.contentView as? WKWebView else {
                    throw NSError(domain: "NativeQA.settingsWindowMissing", code: 1)
                }
                try await waitFor { !web.isLoading }
                var heading = ""
                for _ in 0..<100 {
                    heading = try await text(web, "document.querySelector('h1')?.textContent || ''")
                    if heading == "연결 설정" { break }
                    try await Task.sleep(for: .milliseconds(50))
                }
                try check(heading == "연결 설정", "native-settings-loaded")
                let loginCards = try await text(web, "String(document.querySelectorAll('.oauth-card').length)")
                try check(loginCards == "2", "native-browser-login-cards")
                let ownerInputs = try await text(web, "String(document.querySelectorAll('.oauth-card input').length)")
                try check(ownerInputs == "0", "native-no-client-credential-inputs")
                let secrets = try await text(web, "Array.from(document.querySelectorAll('input[type=password]')).map(x=>x.value).join('')")
                try check(secrets.isEmpty, "native-settings-no-credential-prefill")
                if let path = ProcessInfo.processInfo.environment["QA_SETTINGS_IMAGE"] {
                    let image: NSImage = try await withCheckedThrowingContinuation { continuation in
                        web.takeSnapshot(with: nil) { image, error in
                            if let image { continuation.resume(returning: image) }
                            else { continuation.resume(throwing: error ?? NSError(domain: "NativeQA.snapshot", code: 1)) }
                        }
                    }
                    if let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) {
                        try png.write(to: URL(fileURLWithPath: path))
                    }
                }
                _ = try await text(web, "document.querySelector('.manual-connections').open=true; Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='연결 확인').click(); ''")
                var validation = ""
                for _ in 0..<100 {
                    validation = try await text(web, "document.querySelector('#settings-status')?.textContent || ''")
                    if validation.contains("이메일과 API 토큰") { break }
                    try await Task.sleep(for: .milliseconds(50))
                }
                try check(validation.contains("이메일과 API 토큰"), "native-settings-validation: \(validation)")
                settings.performClose(nil)
                try await waitFor { !delegate.loading }
                delegate.restart()
                try await waitFor { delegate.summary != nil && !delegate.loading }
                try check(delegate.backend.url != original, "restart-gets-new-port")
                let result: [String: Any] = ["verdict": "PASS", "oldURL": original.absoluteString, "lastURL": delegate.backend.url?.absoluteString ?? "", "webURL": link.absoluteString,
                    "scenarios": ["native-load", "popover-open-close", "project-switch-empty", "failed-sync-preserves-data", "web-project-release-link", "native-settings-webview-and-empty-secrets", "restart"]]
                let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
                FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data("\n".utf8))
                delegate.quit()
            } catch {
                FileHandle.standardError.write(Data("Native QA failed: \(error)\n".utf8))
                delegate.backend.stop(); exit(1)
            }
        }
        withExtendedLifetime(delegate) { app.run() }
    }
}
