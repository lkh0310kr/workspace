// World Engine — Qt shell. The engine itself (rendering, physics, ECS,
// and the code-facing SDK API) now lives in ../world-engine-core; this
// crate is only the native window + input glue: a bare Qt window
// (cpp/shim.cpp — no QML, no moc) whose native view world-engine-core
// renders straight into every frame, driven by Qt's own QTimer. See
// docs/architecture/09-future-native-architecture.md ("Phase 10 — engine
// core extracted as a library") for the split's reasoning.
//
// Cross-platform Qt linking — see README.md (macOS/Linux/Windows).

use std::ffi::{c_int, c_void, CString};

use glam::Vec3;
use world_engine_core::{
    build_world, default_scene, init_gpu, key_name_from_qt, load_mesh, load_scene, pick_entity_at_screen_physics,
    render_frame_with_options, Camera, GpuContext, RenderOptions, World, HEIGHT, WIDTH,
};
use world_engine_core::camera::CameraMode;

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
    fn qt_set_window_title(text: *const u8);
}

// Matches cpp/shim.h's InputEventType enum exactly.
const INPUT_MOUSE_DOWN: c_int = 0;
const INPUT_MOUSE_UP: c_int = 1;
const INPUT_MOUSE_DRAG: c_int = 2;
const INPUT_WHEEL: c_int = 3;
const INPUT_KEY_DOWN: c_int = 4;
const INPUT_KEY_UP: c_int = 5;
const INPUT_MOUSE_MOVE: c_int = 6;

enum ShellCamera {
    Orbit(Camera),
    Fly {
        position: Vec3,
        yaw: f32,
        pitch: f32,
    },
}

struct EngineState {
    world: World,
    gpu: Option<GpuContext>,
    camera: ShellCamera,
    loaded_geometry: Option<(Vec<world_engine_core::Vertex>, Vec<u16>)>,
    mouse_x: f32,
    mouse_y: f32,
    picked_name: Option<String>,
}

fn set_window_title(text: &str) {
    if let Ok(cstr) = CString::new(text) {
        unsafe { qt_set_window_title(cstr.as_ptr() as *const u8) };
    }
}

fn fly_basis(yaw: f32, pitch: f32) -> (Vec3, Vec3, Vec3) {
    let (sy, cy) = yaw.sin_cos();
    let (sp, cp) = pitch.sin_cos();
    let forward = Vec3::new(cp * cy, sp, cp * sy).normalize_or_zero();
    let right = forward.cross(Vec3::Y).normalize_or_zero();
    let up = if right.length_squared() < 1e-6 {
        Vec3::Y
    } else {
        right.cross(forward).normalize()
    };
    (forward, right, up)
}

fn apply_fly_movement(state: &mut EngineState, dt: f32) {
    let ShellCamera::Fly { position, yaw, pitch } = &mut state.camera else {
        return;
    };
    const FLY_SPEED: f32 = 7.5;
    let input = state.world.input();
    let (forward, right, _) = fly_basis(*yaw, *pitch);
    let flat_forward = Vec3::new(forward.x, 0.0, forward.z).normalize_or_zero();
    let flat_right = Vec3::new(right.x, 0.0, right.z).normalize_or_zero();
    let mut move_dir = Vec3::ZERO;
    if input.is_key_down("W") {
        move_dir += flat_forward;
    }
    if input.is_key_down("S") {
        move_dir -= flat_forward;
    }
    if input.is_key_down("A") {
        move_dir -= flat_right;
    }
    if input.is_key_down("D") {
        move_dir += flat_right;
    }
    if input.is_key_down("Space") {
        move_dir += Vec3::Y;
    }
    if input.is_key_down("Control") || input.is_key_down("Shift") {
        move_dir -= Vec3::Y;
    }
    if move_dir.length_squared() > 0.0 {
        *position += move_dir.normalize() * FLY_SPEED * dt;
    }
}

fn render_eye_target(state: &EngineState) -> (Vec3, Vec3, f32) {
    match &state.camera {
        ShellCamera::Orbit(cam) => {
            let options = RenderOptions::from_runtime_camera(state.world.camera(), &state.world);
            let eye = options.eye.unwrap_or_else(|| cam.eye());
            let target = options.look_at.unwrap_or(Vec3::ZERO);
            (eye, target, options.fov_deg)
        }
        ShellCamera::Fly { position, yaw, pitch } => {
            let (forward, _, _) = fly_basis(*yaw, *pitch);
            (*position, *position + forward, state.world.camera().fov_deg)
        }
    }
}

fn update_picked_entity(state: &mut EngineState) {
    let (eye, target, fov) = render_eye_target(state);
    let aspect = WIDTH as f32 / HEIGHT as f32;
    let picked = pick_entity_at_screen_physics(
        &state.world,
        eye,
        target,
        fov,
        aspect,
        state.mouse_x,
        state.mouse_y,
        WIDTH as f32,
        HEIGHT as f32,
    )
    .map(|hit| hit.name);
    if picked != state.picked_name {
        state.picked_name = picked.clone();
        let title = match picked {
            Some(name) => format!("World Engine — {name}"),
            None => "World Engine".to_string(),
        };
        set_window_title(&title);
    }
}

extern "C" fn on_init(native_view: *mut c_void, user_data: *mut c_void) {
    let state = unsafe { &mut *(user_data as *mut EngineState) };
    let geometry = state.loaded_geometry.take();
    state.gpu = Some(init_gpu(native_view, geometry));
    println!("wgpu surface created directly in the Qt window.");
}

extern "C" fn on_frame(user_data: *mut c_void) {
    let state = unsafe { &mut *(user_data as *mut EngineState) };
    let dt = state.world.step_dt();
    apply_fly_movement(state, dt);
    if let ShellCamera::Fly { position, yaw, pitch } = &state.camera {
        if let Some((pos, y, p)) = state.world.camera_mut().fly_mut() {
            *pos = *position;
            *y = *yaw;
            *p = *pitch;
        }
    } else if let Some(orbit) = state.world.camera_mut().orbit_mut() {
        if let ShellCamera::Orbit(cam) = &state.camera {
            orbit.yaw = cam.yaw;
            orbit.pitch = cam.pitch;
            orbit.distance = cam.distance;
        }
    }
    state.world.step();
    update_picked_entity(state);
    let draw_list = state.world.draw_list();
    if let Some(gpu) = &state.gpu {
        let (eye, target, fov) = render_eye_target(state);
        let options = RenderOptions {
            show_grid: state.world.show_grid(),
            eye: Some(eye),
            look_at: Some(target),
            fov_deg: fov,
        };
        let orbit_cam = match &state.camera {
            ShellCamera::Orbit(cam) => cam,
            ShellCamera::Fly { .. } => &Camera {
                yaw: 0.0,
                pitch: 0.0,
                distance: 1.0,
            },
        };
        render_frame_with_options(gpu, &draw_list, orbit_cam, &options);
    }
}

/// Drag orbits / fly-look, wheel zooms or dolly — see cpp/shim.cpp for what actually
/// generates these (real Qt mouse/wheel events, not simulated).
extern "C" fn on_input(event_type: c_int, x: f32, y: f32, dx: f32, dy: f32, user_data: *mut c_void) {
    let state = unsafe { &mut *(user_data as *mut EngineState) };
    const ORBIT_SPEED: f32 = 0.01;
    const LOOK_SPEED: f32 = 0.004;
    const ZOOM_SPEED: f32 = 0.01;
    const FLY_WHEEL_SPEED: f32 = 0.02;
    const MIN_DISTANCE: f32 = 2.0;
    const MAX_DISTANCE: f32 = 80.0;
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
        INPUT_MOUSE_MOVE => {
            state.mouse_x = x;
            state.mouse_y = y;
        }
        INPUT_MOUSE_DRAG => {
            state.mouse_x = x;
            state.mouse_y = y;
            match &mut state.camera {
                ShellCamera::Orbit(cam) => {
                    cam.yaw += dx * ORBIT_SPEED;
                    cam.pitch = (cam.pitch - dy * ORBIT_SPEED).clamp(-MAX_PITCH, MAX_PITCH);
                }
                ShellCamera::Fly { yaw, pitch, .. } => {
                    *yaw += dx * LOOK_SPEED;
                    *pitch = (*pitch - dy * LOOK_SPEED).clamp(-MAX_PITCH, MAX_PITCH);
                }
            }
        }
        INPUT_WHEEL => match &mut state.camera {
            ShellCamera::Orbit(cam) => {
                cam.distance = (cam.distance - dy * ZOOM_SPEED).clamp(MIN_DISTANCE, MAX_DISTANCE);
            }
            ShellCamera::Fly { position, yaw, pitch, .. } => {
                let (forward, _, _) = fly_basis(*yaw, *pitch);
                *position += forward * dy * FLY_WHEEL_SPEED;
            }
        },
        INPUT_MOUSE_DOWN | INPUT_MOUSE_UP => {
            state.mouse_x = x;
            state.mouse_y = y;
        }
        _ => {}
    }
}

fn shell_camera_from_world(world: &World) -> ShellCamera {
    match &world.camera().mode {
        CameraMode::Fly { position, yaw, pitch } => ShellCamera::Fly {
            position: *position,
            yaw: *yaw,
            pitch: *pitch,
        },
        CameraMode::Orbit(state) => ShellCamera::Orbit(Camera {
            yaw: state.yaw,
            pitch: state.pitch,
            distance: state.distance,
        }),
        _ => {
            let initial_eye = Vec3::new(4.0, 3.5, 6.0);
            ShellCamera::Orbit(Camera {
                yaw: initial_eye.z.atan2(initial_eye.x),
                pitch: (initial_eye.y / initial_eye.length()).asin(),
                distance: initial_eye.length(),
            })
        }
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

    let mut loaded_geometry: Option<(Vec<world_engine_core::Vertex>, Vec<u16>)> = None;
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

    let world = build_world(&scene, mesh_half_extents, project_dir.as_deref().map(std::path::Path::new));
    let camera = shell_camera_from_world(&world);
    println!(
        "world-engine-qt-shell: Qt native window, wgpu direct render, {} entities",
        world.entity_count()
    );
    let mut state = Box::new(EngineState {
        world,
        gpu: None,
        camera,
        loaded_geometry,
        mouse_x: WIDTH as f32 * 0.5,
        mouse_y: HEIGHT as f32 * 0.5,
        picked_name: None,
    });
    let user_data = &mut *state as *mut EngineState as *mut c_void;
    unsafe {
        qt_run(WIDTH as c_int, HEIGHT as c_int, on_init, on_frame, on_input, user_data);
    }
}
