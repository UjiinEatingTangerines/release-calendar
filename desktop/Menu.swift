import AppKit
import SwiftUI

extension AppDelegate {
    @objc func togglePopover() {
        if popover.isShown { popover.performClose(nil); return }
        guard let button = statusItem?.button else { return }
        render()
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        popover.contentViewController?.view.window?.makeKey()
        loadSummary(refresh: false)
    }
    func render() {
        let available = (statusItem?.button?.window?.screen ?? NSScreen.main)?.visibleFrame.height ?? 800
        let height = min(660, max(340, available - 32))
        let view = PopoverView(projects: projects, selected: selected, mode: mode, summary: summary,
            message: message, loading: loading, ready: backend.url != nil, height: height,
            actions: PopoverActions(selectProject: { [weak self] in self?.chooseProject($0) },
                openWeb: { [weak self] in self?.openWeb($0) }, refresh: { [weak self] in self?.refreshData() },
                settings: { [weak self] in self?.openSettings() }, help: { [weak self] in self?.openHelp() },
                restart: { [weak self] in self?.restart() }, quit: { [weak self] in self?.quit() }))
        if let hosting { hosting.rootView = view }
        else { let controller = NSHostingController(rootView: view); hosting = controller; popover.contentViewController = controller }
        popover.contentSize = NSSize(width: Palette.width, height: height)
        statusItem?.button?.title = (summary?.stale == true || message != nil || !(summary?.warnings.isEmpty ?? true)) ? " !" : ""
        statusItem?.button?.toolTip = "Release Calendar · \(mode == "demo" ? "데모" : "실제 연동")"
    }
}
