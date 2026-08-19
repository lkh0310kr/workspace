use cef::{args::Args, *};

fn main() {
    let args = Args::new();

    #[cfg(target_os = "macos")]
    let _loader = {
        let loader = library_loader::LibraryLoader::new(&std::env::current_exe().unwrap(), true);
        assert!(loader.load());
        loader
    };

    // Re-tried enabling CEF's sandbox here after ruling out six other
    // variables (GPU compositing, pump strategy, WebAuthn JS-injection,
    // real vs. mock Keychain, ephemeral vs. persistent CEF profile,
    // native-parent vs. Views-framework browser embedding) for the
    // reproducible SIGSEGV null-deref (`ldr x0, [x0, #0x10]`, confirmed
    // live under `lldb`) during real page activity — identical crash with
    // the sandbox on, confirmed by attaching `lldb` again: same fault, same
    // instruction. On top of not fixing it, enabling the sandbox reopens a
    // second, separate problem: our ad-hoc/dev codesigning (no per-helper-
    // variant entitlements) makes macOS's process-signature validation
    // (`-67030`) fatal, and helper subprocesses fail their mach-port
    // rendezvous with the parent (`Permission denied`) and die immediately.
    // Reverted, no_sandbox back on. Proper sandboxing needs real
    // entitlements files for each of the 5 CEF helper variants (base/GPU/
    // Renderer/Plugin/Alerts) — real packaging work, and moot until the
    // actual crash is understood, since it wasn't the cause anyway.
    let _ = api_hash(sys::CEF_API_VERSION_LAST, 0);

    execute_process(
        Some(args.as_main_args()),
        None::<&mut App>,
        std::ptr::null_mut(),
    );
}
