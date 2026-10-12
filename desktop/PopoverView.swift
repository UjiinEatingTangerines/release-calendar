import SwiftUI

struct PopoverActions {
    let selectProject: (String) -> Void
    let openWeb: (ReleaseSummary?) -> Void
    let refresh: () -> Void
    let settings: () -> Void
    let help: () -> Void
    let restart: () -> Void
    let quit: () -> Void
}
struct PopoverView: View {
    let projects: [Project]
    let selected: String
    let mode: String
    let summary: MenuSummary?
    let message: String?
    let loading: Bool
    let ready: Bool
    let height: CGFloat
    let actions: PopoverActions

    var body: some View {
        VStack(spacing: 0) {
            header.padding(Palette.gutter)
            Divider().opacity(0.5)
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    if let message { notice(message, symbol: loading ? "arrow.triangle.2.circlepath" : "exclamationmark.triangle", color: loading ? Palette.muted : Palette.amber) }
                    if let summary {
                        if !summary.warnings.isEmpty { notice(warningText(summary.warnings), symbol: "exclamationmark.triangle.fill", color: Palette.amber).help(summary.warnings.joined(separator: ", ")) }
                        HStack {
                            Text("릴리스 일정").font(.system(size: 12, weight: .semibold))
                            StatusBadge(text: "\(summary.totalPending)")
                            Spacer()
                            Text("Jira · 미출시").font(.system(size: 11)).foregroundStyle(Palette.muted)
                        }
                        if summary.registeredFuturePlans == 0 { Text("등록된 미래 계획이 없습니다.").font(.system(size: 12)).foregroundStyle(Palette.muted) }
                        if summary.releases.isEmpty { emptyState }
                        ForEach(summary.releases, id: \.releaseId) { release in ReleaseCard(release: release) { actions.openWeb(release) } }
                        if summary.totalPending > summary.releases.count {
                            Button("외 \(summary.totalPending - summary.releases.count)개 전체 보기") { actions.openWeb(nil) }.buttonStyle(.link).font(.system(size: 12))
                        }
                    } else if loading { ProgressView().frame(maxWidth: .infinity).padding(20) }
                    else { emptyState }
                    Label("일정상 단계이며, 운영 배포 성공을 뜻하지 않습니다.", systemImage: "info.circle")
                        .font(.system(size: 11)).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 4)
                }.padding(Palette.gutter)
            }
            Divider().opacity(0.5)
            footer.padding(Palette.gutter)
        }
        .frame(width: Palette.width, height: height)
        .background(Palette.canvas)
    }
    private var header: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: "calendar").font(.system(size: 20, weight: .medium)).foregroundStyle(Palette.teal)
                    .frame(width: 36, height: 36).background(Palette.teal.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Release Calendar").font(.system(size: 17, weight: .semibold))
                    Text("다음 릴리스, 한눈에").font(.system(size: 11)).foregroundStyle(Palette.muted)
                }
                Spacer()
                StatusBadge(text: mode == "demo" ? "데모" : "연동", color: mode == "demo" ? Palette.muted : Palette.teal, symbol: mode == "demo" ? "sparkle" : "link")
            }
            HStack {
                Menu {
                    ForEach(projects, id: \.id) { project in
                        Button { actions.selectProject(project.id) } label: {
                            if selected == project.id { Label(project.name, systemImage: "checkmark") } else { Text(project.name) }
                        }
                    }
                } label: {
                    Label(projects.first(where: { $0.id == selected })?.name ?? "프로젝트", systemImage: "square.stack.3d.up")
                        .font(.system(size: 12, weight: .medium)).lineLimit(1)
                }.menuStyle(.borderlessButton).disabled(loading || projects.isEmpty).accessibilityLabel("프로젝트 선택")
                Spacer(minLength: 8)
                Text(summary?.timezone ?? "로컬 전용").font(.system(size: 11)).foregroundStyle(Palette.muted)
            }
        }
    }
    private var footer: some View {
        VStack(spacing: 12) {
            Button { actions.openWeb(nil) } label: {
                HStack { Image(systemName: "calendar"); Text("전체 캘린더 열기"); Spacer(); Image(systemName: "arrow.up.right") }
                    .font(.system(size: 12, weight: .semibold)).padding(.horizontal, 12).frame(height: 36)
                    .foregroundStyle(.white).background(Palette.action, in: RoundedRectangle(cornerRadius: 8))
            }.buttonStyle(.plain).disabled(!ready)
            HStack(spacing: 8) {
                Image(systemName: summary?.stale == true ? "clock.badge.exclamationmark" : "clock").foregroundStyle(summary?.stale == true ? Palette.amber : Palette.muted)
                VStack(alignment: .leading, spacing: 2) {
                    Text(mode == "demo" ? "가상 데이터" : "마지막 동기화").font(.system(size: 11)).foregroundStyle(Palette.muted)
                    Text(freshness).font(.system(size: 11, weight: .medium)).monospacedDigit()
                }
                Spacer()
                Button(action: actions.refresh) {
                    if loading { ProgressView().controlSize(.small).frame(width: 32, height: 32) }
                    else { Image(systemName: "arrow.clockwise").frame(width: 32, height: 32) }
                }.buttonStyle(.borderless).disabled(loading || !ready || selected.isEmpty).help("지금 새로고침").accessibilityLabel("지금 새로고침")
                Menu {
                    Button("연동 설정 폴더 열기…", action: actions.settings)
                    Button("설정 도움말…", action: actions.help)
                    Button("설정 다시 읽기 / 서버 재시작", action: actions.restart)
                    Divider()
                    Button("Release Calendar 종료", action: actions.quit)
                } label: { Image(systemName: "gearshape").frame(width: 32, height: 32) }
                .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize().accessibilityLabel("설정 및 종료")
            }.font(.system(size: 12))
        }
    }
    private var freshness: String {
        guard let summary, let value = summary.dataAsOf else { return "정상 동기화 기록 없음" }
        let parser = ISO8601DateFormatter(); parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: value) else { return "시각 확인 필요" }
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "ko_KR")
        formatter.timeZone = TimeZone(identifier: summary.timezone); formatter.dateFormat = "MM/dd HH:mm"
        return formatter.string(from: date)
    }
    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "calendar.badge.clock").font(.system(size: 24)).foregroundStyle(Palette.muted)
            Text(summary?.dataAsOf == nil ? "일정을 불러올 준비가 됐어요" : "예정된 릴리스가 없어요").font(.system(size: 13, weight: .semibold))
            Text(summary?.dataAsOf == nil ? "연동 설정 후 새로고침을 눌러 주세요." : "과거 릴리스는 전체 캘린더에서 확인하세요.").font(.system(size: 12)).foregroundStyle(Palette.muted)
        }.frame(maxWidth: .infinity).padding(.vertical, 20)
    }
    private func notice(_ text: String, symbol: String, color: Color) -> some View {
        Label(text, systemImage: symbol).font(.system(size: 12)).foregroundStyle(.primary)
            .padding(10).frame(maxWidth: .infinity, alignment: .leading).background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
    }
    private func warningText(_ warnings: [String]) -> String {
        if warnings.contains(where: { $0.contains("CREDENTIAL") }) { return "인증정보가 필요합니다. 설정을 확인해 주세요." }
        if warnings.contains("NO_SUCCESSFUL_SNAPSHOT") { return "아직 동기화된 데이터가 없습니다." }
        if warnings.contains(where: { $0.hasPrefix("jira:") || $0.hasPrefix("github:") }) { return "일부 연동을 조회하지 못해 마지막 정상 데이터를 표시합니다." }
        if warnings.contains("STALE_OR_MISSING_DATA") { return "오래된 데이터입니다. 새로고침해 주세요." }
        return "일정 데이터에 확인이 필요한 항목이 있습니다."
    }
}
