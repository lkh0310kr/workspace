import BackgroundTasks
import Foundation

/// Lets iOS wake the app now and then to pull from GitHub, so notes are already current when it is opened.
/// iOS decides when (and how often) this runs; the app being closed is fine, a force-quit is not.
@MainActor
enum BackgroundRefresh {
    static let identifier = "com.lkh0310kr.pkms.refresh"
    private static let interval: TimeInterval = 15 * 60

    /// Must be called before the app finishes launching.
    static func register(sync: SyncController) {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
            MainActor.assumeIsolated {
                handle(task as! BGAppRefreshTask, sync: sync)
            }
        }
    }

    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: interval)
        try? BGTaskScheduler.shared.submit(request)
    }

    private static func handle(_ task: BGAppRefreshTask, sync: SyncController) {
        schedule()  // keep the chain going whatever happens below
        let work = Task { @MainActor in
            await sync.sync()
            task.setTaskCompleted(success: !Task.isCancelled)
        }
        task.expirationHandler = { work.cancel() }
    }
}
