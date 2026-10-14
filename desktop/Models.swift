import Foundation

struct ProjectList: Decodable {
    let mode: String
    let projects: [Project]
}
struct Project: Decodable {
    let id: String
    let name: String
    let timezone: String
}
struct MenuSummary: Decodable {
    let project: String
    let timezone: String
    let dataAsOf: String?
    let stale: Bool
    let warnings: [String]
    let registeredFuturePlans: Int
    let totalPending: Int
    let releases: [ReleaseSummary]
}
struct ReleaseSummary: Decodable {
    let releaseId: String
    let name: String
    let releaseDate: String?
    let daysUntilRelease: Int?
    let phase: String
    let nextDeadline: Deadline?
}
struct Deadline: Decodable {
    let kind: String
    let date: String
    let source: String
}
struct ServerReady: Decodable { let url: String }

func phaseLabel(_ phase: String) -> String {
    switch phase {
    case "planning": return "계획 기간 · 예상"
    case "development": return "개발 기간"
    case "qa": return "QA 예상 기간"
    case "frozen": return "기능 마감 이후 · 예상"
    case "release": return "출시 예정일"
    case "past-scheduled-date": return "예정일 지남 · 미출시"
    case "unscheduled": return "일정 미등록"
    case "planned": return "계획됨"
    default: return "일정 확인 필요"
    }
}
func deadlineLabel(_ kind: String) -> String {
    switch kind {
    case "planning": return "계획 마감"
    case "freeze": return "기능 마감"
    case "qa": return "QA 시작"
    case "release": return "출시"
    case "ticket": return "티켓 기한"
    default: return "마감"
    }
}
func countdown(_ days: Int?) -> String {
    guard let days else { return "날짜 없음" }
    if days == 0 { return "D-day" }
    return days > 0 ? "D−\(days)" : "\(-days)일 지남"
}
