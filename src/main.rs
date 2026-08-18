fn main() {
    if !workspace_app_lib::cef_dispatch_subprocess() {
        // A CEF helper subprocess (GPU/renderer/network/...) re-exec'd this
        // binary; it must exit here without ever touching Tauri.
        return;
    }
    workspace_app_lib::run();
}
