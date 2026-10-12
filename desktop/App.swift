import AppKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let backend = Backend()
    var statusItem: NSStatusItem?
    let popover = NSPopover()
    var hosting: NSHostingController<PopoverView>?
    var projects: [Project] = []
    var selected = UserDefaults.standard.string(forKey: "selectedProject") ?? ""
    var mode = "demo"
    var summary: MenuSummary?
    var message: String? = "시작 중…"
    var loading = false
    var timer: Timer?
    var request: Task<Void, Never>?
    var generation = 0

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem?.button?.image = NSImage(systemSymbolName: "calendar", accessibilityDescription: "Release Calendar")
        statusItem?.button?.image?.isTemplate = true
        statusItem?.button?.setAccessibilityLabel("Release Calendar")
        backend.onChange = { [weak self] error in
            guard let self else { return }
            self.message = error
            if error == nil { self.loadProjects() } else { self.generation += 1; self.request?.cancel(); self.loading = false; self.summary = nil; self.render() }
        }
        statusItem?.button?.target = self
        statusItem?.button?.action = #selector(togglePopover)
        popover.behavior = .transient
        render(); backend.start()
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.loadSummary(refresh: false) }
        }
    }
    func applicationWillTerminate(_ notification: Notification) {
        timer?.invalidate(); request?.cancel(); backend.stop()
    }
    func endpoint(_ path: String, project: String? = nil) -> URL? {
        guard let base = backend.url, var url = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false) else { return nil }
        if let project { url.queryItems = [URLQueryItem(name: "project", value: project)] }
        return url.url
    }
    func read<T: Decodable>(_ type: T.Type, url: URL) async throws -> T {
        var request = URLRequest(url: url); request.timeoutInterval = 10
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, response.statusCode == 200 else { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode(type, from: data)
    }
    func loadProjects() {
        guard let url = endpoint("api/projects") else { return }
        generation += 1; let serial = generation
        request?.cancel(); loading = true
        request = Task {
            do {
                let result = try await read(ProjectList.self, url: url)
                guard serial == generation, !Task.isCancelled else { return }
                projects = result.projects; mode = result.mode
                if !projects.contains(where: { $0.id == selected }) { selected = projects.first?.id ?? "" }
                loading = false; loadSummary(refresh: false)
            } catch {
                guard serial == generation, !Task.isCancelled else { return }
                loading = false; message = "프로젝트를 불러오지 못했습니다. 서버를 다시 시작해 주세요."; render()
            }
        }
    }
    func loadSummary(refresh: Bool) {
        guard !loading, !selected.isEmpty, let url = endpoint("api/menu", project: selected) else { return }
        generation += 1; let serial = generation
        request?.cancel(); loading = true; message = refresh ? "동기화 중…" : nil; render()
        request = Task {
            do {
                if refresh, let refreshURL = endpoint("api/refresh", project: selected) {
                    var write = URLRequest(url: refreshURL); write.httpMethod = "POST"; write.timeoutInterval = 300
                    write.setValue("local", forHTTPHeaderField: "X-Release-Calendar")
                    let (_, response) = try await URLSession.shared.data(for: write)
                    guard let response = response as? HTTPURLResponse, response.statusCode == 200 else { throw URLError(.badServerResponse) }
                }
                let result = try await read(MenuSummary.self, url: url)
                guard serial == generation, !Task.isCancelled else { return }
                summary = result; message = nil
            } catch {
                guard serial == generation, !Task.isCancelled else { return }
                message = "조회 실패 · 마지막 표시 데이터를 유지합니다."
            }
            guard serial == generation else { return }
            loading = false; render()
        }
    }
    func chooseProject(_ id: String) {
        generation += 1; request?.cancel(); loading = false
        selected = id; summary = nil; UserDefaults.standard.set(id, forKey: "selectedProject")
        loadSummary(refresh: false)
    }
    @objc func refreshData() { loadSummary(refresh: true) }
    @objc func restart() {
        generation += 1; request?.cancel(); loading = false; summary = nil; projects = []
        backend.stop(); message = "시작 중…"; render(); backend.start()
    }
    func webURL(_ release: ReleaseSummary? = nil) -> URL? {
        guard let base = backend.url, var url = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return nil }
        url.queryItems = [URLQueryItem(name: "project", value: selected)]
        if let release {
            url.queryItems?.append(URLQueryItem(name: "release", value: release.releaseId))
            if let date = release.releaseDate { url.queryItems?.append(URLQueryItem(name: "month", value: String(date.prefix(7)))) }
        }
        return url.url
    }
    func openWeb(_ release: ReleaseSummary? = nil) {
        if let target = webURL(release) { NSWorkspace.shared.open(target); popover.performClose(nil) }
    }
    @objc func openSettings() {
        let folder = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".config/release-calendar")
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            NSWorkspace.shared.open(folder)
        } catch { message = "설정 폴더를 열 수 없습니다."; render() }
    }
    @objc func openHelp() {
        if let url = Bundle.main.resourceURL?.appendingPathComponent("macos.md") { NSWorkspace.shared.open(url) }
    }
    @objc func quit() { NSApplication.shared.terminate(nil) }
}
