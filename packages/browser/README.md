# @workspace/browser

Browser feature package: pane view and overlay slot, pane-kind definition factory, address input, navigation/history UI, viewport state, guest recovery policy, zoom policy, tab URL/label policy, and pane chrome CSS. `BrowserWebviewPort` describes only the guest surface the feature uses, and the typed `BrowserPaneHost` lets Desktop provide guest lifecycle, webview creation, persistent guest registry lookup, download state/reveal, InteractionCoordinator, and IPC behavior. The Desktop adapter translates Electron's webview type at that boundary. BrowserContent loads the package-owned pane and overlay CSS.

Detailed lifecycle and IPC contract: [Browser architecture](../../docs/architecture/workspace/browser/README.md).
