use cef::{args::Args, *};

fn main() {
    let args = Args::new();

    #[cfg(target_os = "macos")]
    let _loader = {
        let loader = library_loader::LibraryLoader::new(&std::env::current_exe().unwrap(), true);
        assert!(loader.load());
        loader
    };

    // Tried enabling CEF's sandbox here (see git history) after a real
    // crash report showed a SIGSEGV deep inside V8
    // (`v8_internal_simulator_ProbeMemory`) while submitting Google's login
    // form — weaker V8 memory protection without the OS sandbox was the
    // suspected cause. Reverted: with the sandbox on, our ad-hoc/dev
    // codesigning (no per-helper-variant entitlements) makes macOS's
    // process-signature validation (`-67030` in the log) fatal instead of
    // just a warning, and the app now dies silently (no crash report,
    // fast) on almost every launch — a worse trade than the rare V8 crash.
    // Proper sandboxing needs real entitlements files for each of the 5 CEF
    // helper variants (base/GPU/Renderer/Plugin/Alerts), which is real
    // packaging work, not a quick flag flip.
    let _ = api_hash(sys::CEF_API_VERSION_LAST, 0);

    execute_process(
        Some(args.as_main_args()),
        None::<&mut App>,
        std::ptr::null_mut(),
    );
}
