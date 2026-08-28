fn main() {
    // Phase 1 spike, macOS only for now (Qt's Homebrew layout differs
    // enough per-platform — Linux/Windows linking is a real follow-up,
    // not guessed at here).
    let qt_lib = "/opt/homebrew/opt/qt/lib";

    cc::Build::new()
        .cpp(true)
        .file("cpp/shim.cpp")
        .flag("-std=c++17")
        .flag("-fPIC")
        .flag(&format!("-F{qt_lib}"))
        .compile("qt_shim");

    println!("cargo:rustc-link-arg=-F{qt_lib}");
    println!("cargo:rustc-link-arg=-Wl,-rpath,{qt_lib}");
    for framework in ["QtCore", "QtGui", "QtWidgets"] {
        println!("cargo:rustc-link-arg=-framework");
        println!("cargo:rustc-link-arg={framework}");
    }
    println!("cargo:rerun-if-changed=cpp/shim.cpp");
    println!("cargo:rerun-if-changed=cpp/shim.h");
}
