#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::thread;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::time::Duration;

#[cfg(any(target_os = "macos", target_os = "windows"))]
use glam::Vec3;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use world_engine_core::{build_world, default_scene, render_frame, Camera, GpuContext};

#[cfg(any(target_os = "macos", target_os = "windows"))]
struct RenderGpu(GpuContext);
#[cfg(any(target_os = "macos", target_os = "windows"))]
// wgpu presents from a dedicated thread; the native handle is only touched on
// the main thread during surface setup (same pattern as the original embed spike).
unsafe impl Send for RenderGpu {}

/// Steps physics and renders into `gpu` on a dedicated thread (~30fps).
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn spawn_render_loop(gpu: GpuContext) {
    thread::Builder::new()
        .name("world-engine-render".into())
        .spawn(move || {
            let RenderGpu(gpu) = RenderGpu(gpu);
            let mut world = build_world(&default_scene(), None, None);
            let initial_eye = Vec3::new(4.0, 3.5, 6.0);
            let camera = Camera {
                yaw: initial_eye.z.atan2(initial_eye.x),
                pitch: (initial_eye.y / initial_eye.length()).asin(),
                distance: initial_eye.length(),
            };
            loop {
                world.step();
                let draw_list = world.draw_list();
                render_frame(&gpu, &draw_list, &camera);
                thread::sleep(Duration::from_millis(33));
            }
        })
        .expect("failed to spawn world-engine render thread");
}
