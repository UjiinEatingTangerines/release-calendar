import AppKit

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
                delegate.restart()
                try await waitFor { delegate.summary != nil && !delegate.loading }
                try check(delegate.backend.url != original, "restart-gets-new-port")
                let result: [String: Any] = ["verdict": "PASS", "oldURL": original.absoluteString, "lastURL": delegate.backend.url?.absoluteString ?? "", "webURL": link.absoluteString,
                    "scenarios": ["native-load", "popover-open-close", "project-switch-empty", "failed-sync-preserves-data", "web-project-release-link", "restart"]]
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
