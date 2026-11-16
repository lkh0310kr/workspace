# @workspace/browser

Browser feature package: pane view and overlay slot, address input, navigation/history UI, viewport state, guest recovery policy, zoom policy, and guest focus coordination. The typed `BrowserPaneHost` boundary lets Desktop provide Electron webview creation, persistent guest registry lookup, download state/reveal, InteractionCoordinator, and IPC behavior. BrowserContent loads the package-owned pane and overlay CSS.

Detailed lifecycle and IPC contract: [Browser architecture](../../docs/architecture/workspace/browser/README.md).
