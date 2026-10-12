import AppKit

@MainActor
final class Backend {
    private var process: Process?
    private var input: Pipe?
    private var output: Pipe?
    private var timeout: DispatchWorkItem?
    private var buffer = Data()
    private(set) var url: URL?
    var onChange: ((String?) -> Void)?

    func start() {
        guard process == nil, let resources = Bundle.main.resourceURL else { return }
        let child = Process(), stdin = Pipe(), stdout = Pipe()
        do {
            let nodePath = try String(contentsOf: resources.appendingPathComponent("node-path.txt"), encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
            guard FileManager.default.isExecutableFile(atPath: nodePath) else {
                onChange?("Node.js를 찾을 수 없습니다. 앱을 다시 빌드해 주세요."); return
            }
            child.executableURL = URL(fileURLWithPath: nodePath)
            child.arguments = [resources.appendingPathComponent("server/desktop.mjs").path]
            child.standardInput = stdin; child.standardOutput = stdout
            // Never forward provider or environment contents into desktop logs.
            child.standardError = FileHandle.nullDevice
            stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let data = handle.availableData
                Task { @MainActor in self?.receive(data) }
            }
            child.terminationHandler = { [weak self] exited in
                Task { @MainActor in
                    guard let self, self.process === exited else { return }
                    self.stop()
                    self.onChange?("서버가 종료됐습니다. 설정·인증 파일 권한을 확인하고 다시 시작하세요.")
                }
            }
            process = child; input = stdin; output = stdout
            try child.run()
            let deadline = DispatchWorkItem { [weak self] in
                guard let self, self.url == nil else { return }
                self.stop(); self.onChange?("서버 시작 시간이 초과됐습니다. 다시 시작해 주세요.")
            }
            timeout = deadline; DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: deadline)
        } catch {
            stop(); onChange?("로컬 서버를 실행하지 못했습니다. 앱을 다시 빌드해 주세요.")
        }
    }
    private func receive(_ data: Data) {
        guard process != nil, url == nil, !data.isEmpty else { return }
        buffer.append(data)
        guard buffer.count < 8192 else { stop(); onChange?("서버 응답을 확인할 수 없습니다."); return }
        guard let newline = buffer.firstIndex(of: 10) else { return }
        guard let ready = try? JSONDecoder().decode(ServerReady.self, from: buffer.prefix(upTo: newline)),
              let parsed = URL(string: ready.url), parsed.scheme == "http", parsed.host == "127.0.0.1",
              let port = parsed.port, (1...65535).contains(port) else {
            stop(); onChange?("서버 주소를 확인할 수 없습니다."); return
        }
        url = parsed; timeout?.cancel(); onChange?(nil)
    }
    func stop() {
        timeout?.cancel(); timeout = nil
        output?.fileHandleForReading.readabilityHandler = nil
        // Release the only writer; the child exits on EOF even after a force quit.
        input?.fileHandleForWriting.closeFile()
        input = nil; output = nil
        let child = process; process = nil; url = nil; buffer = Data()
        if let child, child.isRunning { child.terminate() }
    }
}
