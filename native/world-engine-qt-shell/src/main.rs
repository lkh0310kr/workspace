// World Engine — Qt shell. The engine itself (rendering, physics, ECS,
// and the code-facing SDK API) now lives in ../world-engine-core; this
// crate is only the native window + input glue: a bare Qt window
// (cpp/shim.cpp — no QML, no moc) whose native view world-engine-core
// renders straight into every frame, driven by Qt's own QTimer. See
// docs/architecture/09-future-native-architecture.md ("Phase 10 — engine
// core extracted as a library") for the split's reasoning.
//
// Cross-platform Qt linking — see README.md (macOS/Linux/Windows).

use std::ffi::{c_int, c_void};

use glam::Vec3;
use world_engine_core::{Camera, GpuContext, Vertex, World, build_world, default_scene, init_gpu, key_name_from_qt, load_mesh, load_scene, render_frame, HEIGHT, WIDTH};

type InitCallback = extern "C" fn(*mut c_void, *mut c_void);
type FrameCallback = extern "C" fn(*mut c_void);
type InputCallback = extern "C" fn(c_int, f32, f32, f32, f32, *mut c_void);

unsafe extern "C" {
    fn qt_run(
        width: c_int,
        height: c_int,
        init_cb: InitCallback,
        frame_cb: FrameCallback,
        input_cb: InputCallback,
        user_data: *mut c_void,
    );
}

// Matches cpp/shim.h's InputEventType enum exactly.
const INPUT_MOUSE_DOWN: c_int = 0;
const INPUT_MOUSE_UP: c_int = 1;
const INPUT_MOUSE_DRAG: c_int = 2;
const INPUT_WHEEL: c_int = 3;
const INPUT_KEY_DOWN: c_int = 4;
const INPUT_KEY_UP: c_int = 5;

// ── FFI glue ──────────────────────────────────────────────────────────

struct EngineState {
    world: World,
    gpu: Option<GpuContext>,
    camera: Camera,
    // Taken (replaced with None) the moment on_init consumes it —
    // GpuContext needs to own its own buffers, this is just the handoff
    // from main()'s scene-loading to init_gpu(). None means no scene
    // mesh was loaded (no project, no mesh field, or it failed to load).
    loaded_geometry: Option<(Vec<Vertex>, Vec<u16>)>,
}

extern "C" fn on_init(native_view: *mut c_void, user_data: *mut c_void) {
    let state = unsafe { &mut *(user_data as *mut EngineState) };
    let geometry = state.loaded_geometry.take();
    state.gpu = Some(init_gpu(native_view, geometry));
    println!("wgpu surface created directly in the Qt window.");
}

extern "C" fn on_frame(user_data: *mut c_void) {
    let state = unsafe { &mut *(user_data as *mut EngineState) };
    state.world.step();
    let draw_list = state.world.draw_list();
    if let Some(gpu) = &state.gpu {
        render_frame(gpu, &draw_list, &state.camera);
    }
}

/// Drag orbits, wheel zooms — see cpp/shim.cpp for what actually
/// generates these (real Qt mouse/wheel events, not simulated).
extern "C" fn on_input(event_type: c_int, x: f32, _y: f32, dx: f32, dy: f32, user_data: *mut c_void) {
    let state = unsafe { &mut *(user_data as *mut EngineState) };
    const ORBIT_SPEED: f32 = 0.01;
    const ZOOM_SPEED: f32 = 0.01;
    const MIN_DISTANCE: f32 = 2.0;
    const MAX_DISTANCE: f32 = 40.0;
    const MAX_PITCH: f32 = std::f32::consts::FRAC_PI_2 - 0.05;

    match event_type {
        INPUT_KEY_DOWN => {
            if let Some(name) = key_name_from_qt(x as i32) {
                state.world.input_mut().key_down(name);
            }
        }
        INPUT_KEY_UP => {
            if let Some(name) = key_name_from_qt(x as i32) {
                state.world.input_mut().key_up(name);
            }
        }
        INPUT_MOUSE_DRAG => {
            // Why (found via a real live-QA report, not assumed): this was
            // `-=`, which felt backwards on a real macOS trackpad —
            // dragging right orbited the camera the "wrong" way relative
            // to how the scene visually moved. Flipped to `+=` to match
            // natural drag-to-orbit feel.
            state.camera.yaw += dx * ORBIT_SPEED;
            state.camera.pitch = (state.camera.pitch + dy * ORBIT_SPEED).clamp(-MAX_PITCH, MAX_PITCH);
        }
        INPUT_WHEEL => {
            state.camera.distance = (state.camera.distance - dy * ZOOM_SPEED).clamp(MIN_DISTANCE, MAX_DISTANCE);
        }
        INPUT_MOUSE_DOWN | INPUT_MOUSE_UP => {}
        _ => {}
    }
}

fn main() {
    // Optional first CLI arg: a project directory containing
    // world-engine.json. No arg (e.g. the app-menu "Launch World Engine
    // (dev)" trigger) keeps the original single-cube demo behavior.
    let project_dir = std::env::args().nth(1);
    let scene = match &project_dir {
        Some(dir) => load_scene(dir),
        None => default_scene(),
    };

    // scene.mesh, if present, is relative to the project directory —
    // load it once here; on_init() falls back to the built-in cube/sphere
    // if this is None (no project, or no mesh specified, or it failed to
    // load — a broken mesh reference shouldn't crash the whole engine).
    // mesh_half_extents is the loaded mesh's own AABB, used to size every
    // entity's collider to actually match the mesh instead of a hardcoded
    // default cuboid.
    let mut loaded_geometry: Option<(Vec<Vertex>, Vec<u16>)> = None;
    let mut mesh_half_extents: Option<[f32; 3]> = None;
    if let (Some(dir), Some(mesh_rel)) = (&project_dir, &scene.mesh) {
        let mesh_path = std::path::Path::new(dir).join(mesh_rel);
        match load_mesh(&mesh_path) {
            Ok((vertices, indices, half_extents)) => {
                loaded_geometry = Some((vertices, indices));
                mesh_half_extents = Some(half_extents);
            }
            Err(err) => {
                eprintln!("failed to load mesh {mesh_path:?}: {err:#} — using the built-in cube instead.");
            }
        }
    }

    let initial_eye = Vec3::new(4.0, 3.5, 6.0);
    let camera = Camera {
        yaw: initial_eye.z.atan2(initial_eye.x),
        pitch: (initial_eye.y / initial_eye.length()).asin(),
        distance: initial_eye.length(),
    };
    let world = build_world(&scene, mesh_half_extents, project_dir.as_deref().map(std::path::Path::new));
    println!("world-engine-qt-shell: Qt native window, wgpu direct render, {} entities", world.entity_count());
    let mut state = Box::new(EngineState { world, gpu: None, camera, loaded_geometry });
    let user_data = &mut *state as *mut EngineState as *mut c_void;
    unsafe {
        qt_run(WIDTH as c_int, HEIGHT as c_int, on_init, on_frame, on_input, user_data);
    }
}
