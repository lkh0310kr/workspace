import SwiftUI

@main
struct PKMSCloudApp: App {
    @State private var model = PKMSModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(model)
                .task { await model.restoreSession() }
        }
    }
}
