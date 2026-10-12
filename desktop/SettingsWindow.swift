import AppKit
import WebKit

@MainActor
final class SettingsWindow: NSObject, WKNavigationDelegate, WKUIDelegate, NSWindowDelegate {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var origin: URL?
    var onClose: (() -> Void)?

    func show(base: URL) {
        if let window, origin == base { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true); return }
        window?.close()
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self; web.uiDelegate = self
        let panel = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 920, height: 760), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        panel.title = "연결 설정 · Release Calendar"; panel.minSize = NSSize(width: 540, height: 600)
        panel.contentView = web; panel.delegate = self; panel.isReleasedWhenClosed = false
        origin = base; window = panel; webView = web
        web.load(URLRequest(url: base.appendingPathComponent("settings.html")))
        panel.center(); panel.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
    }
    func windowWillClose(_ notification: Notification) { webView?.stopLoading(); webView = nil; window = nil; origin = nil; onClose?() }
    func invalidate() { window?.close(); window = nil; webView = nil; origin = nil }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        let local = url.scheme == origin?.scheme && url.host == origin?.host && url.port == origin?.port
        if local && action.targetFrame != nil { decisionHandler(.allow); return }
        if action.navigationType == .linkActivated && (local || ["https"].contains(url.scheme ?? "")) { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = message
        alert.addButton(withTitle: "확인"); alert.addButton(withTitle: "취소")
        guard let window else { completionHandler(false); return }
        alert.beginSheetModal(for: window) { response in completionHandler(response == .alertFirstButtonReturn) }
    }
}
