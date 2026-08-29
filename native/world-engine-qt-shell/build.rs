use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=cpp/shim.cpp");
    println!("cargo:rerun-if-changed=cpp/shim.h");
    println!("cargo:rerun-if-env-changed=QT_INSTALL_PREFIX");

    match env::var("CARGO_CFG_TARGET_OS").unwrap().as_str() {
        "macos" => link_macos(),
        "windows" => link_windows(),
        "linux" => link_linux(),
        other => panic!("world-engine-qt-shell: unsupported target OS: {other}"),
    }
}

fn compile_shim() -> cc::Build {
    let mut build = cc::Build::new();
    build.cpp(true).file("cpp/shim.cpp");
    build
}

fn link_macos() {
    let qt_lib = "/opt/homebrew/opt/qt/lib";
    compile_shim()
        .flag("-std=c++17")
        .flag("-fPIC")
        .flag(format!("-F{qt_lib}"))
        .compile("qt_shim");

    println!("cargo:rustc-link-arg=-F{qt_lib}");
    println!("cargo:rustc-link-arg=-Wl,-rpath,{qt_lib}");
    for framework in ["QtCore", "QtGui", "QtWidgets"] {
        println!("cargo:rustc-link-arg=-framework");
        println!("cargo:rustc-link-arg={framework}");
    }
}

fn link_windows() {
    let qt = qt_install_prefix().unwrap_or_else(|| {
        panic!(
            "Qt 6 not found. Install the Desktop MSVC 64-bit kit from https://www.qt.io/download \
             and set QT_INSTALL_PREFIX (e.g. C:\\Qt\\6.8.0\\msvc2022_64), or add qmake.exe to PATH."
        )
    });
    let include = qt.join("include");
    compile_shim()
        .flag("/EHsc")
        .flag("/std:c++17")
        .include(&include)
        .include(include.join("QtCore"))
        .include(include.join("QtGui"))
        .include(include.join("QtWidgets"))
        .compile("qt_shim");

    let lib = qt.join("lib");
    println!("cargo:rustc-link-search=native={}", lib.display());
    for lib_name in ["Qt6Widgets", "Qt6Gui", "Qt6Core"] {
        println!("cargo:rustc-link-lib={lib_name}");
    }
}

fn link_linux() {
    let qt = qt_install_prefix().unwrap_or_else(|| {
        panic!(
            "Qt 6 not found. Install qt6-base-dev (and libxkbcommon-dev), or set QT_INSTALL_PREFIX."
        )
    });
    let include = qt.join("include");
    compile_shim()
        .flag("-std=c++17")
        .flag("-fPIC")
        .include(&include)
        .include(include.join("QtCore"))
        .include(include.join("QtGui"))
        .include(include.join("QtWidgets"))
        .compile("qt_shim");

    let lib = qt.join("lib");
    println!("cargo:rustc-link-search=native={}", lib.display());
    for lib_name in ["Qt6Widgets", "Qt6Gui", "Qt6Core"] {
        println!("cargo:rustc-link-lib={lib_name}");
    }
}

fn qt_install_prefix() -> Option<PathBuf> {
    if let Ok(prefix) = env::var("QT_INSTALL_PREFIX") {
        let path = PathBuf::from(prefix);
        if path.join("include").join("QtWidgets").join("QApplication").is_file()
            || path.join("include").join("QtWidgets").is_dir()
        {
            return Some(path);
        }
    }

    let qmake = which_qmake()?;
    let output = Command::new(&qmake)
        .args(["-query", "QT_INSTALL_PREFIX"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let prefix = String::from_utf8(output.stdout).ok()?.trim().to_string();
    if prefix.is_empty() {
        None
    } else {
        Some(PathBuf::from(prefix))
    }
}

fn which_qmake() -> Option<PathBuf> {
    for candidate in qmake_candidates() {
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn qmake_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(path) = env::var("PATH") {
        let sep = if cfg!(windows) { ';' } else { ':' };
        for dir in path.split(sep) {
            let qmake = Path::new(dir).join(if cfg!(windows) { "qmake.exe" } else { "qmake" });
            out.push(qmake);
        }
    }
    if cfg!(windows) {
        if let Ok(pf) = env::var("ProgramFiles") {
            let qt_root = PathBuf::from(pf).join("Qt");
            if let Ok(entries) = std::fs::read_dir(&qt_root) {
                for ver in entries.flatten() {
                    if let Ok(kits) = std::fs::read_dir(ver.path()) {
                        for kit in kits.flatten() {
                            out.push(kit.path().join("bin").join("qmake.exe"));
                        }
                    }
                }
            }
        }
    } else if cfg!(target_os = "macos") {
        out.push(PathBuf::from("/opt/homebrew/opt/qt/bin/qmake"));
    } else {
        out.push(PathBuf::from("/usr/bin/qmake6"));
        out.push(PathBuf::from("/usr/bin/qmake"));
    }
    out
}
