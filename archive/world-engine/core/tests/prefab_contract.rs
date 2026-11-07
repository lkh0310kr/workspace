//! Phase 20 — prefab spawn.

use world_engine_core::prefab::{load_prefab, spawn_prefab_at};
use world_engine_core::World;

#[test]
fn spawn_prefab_increases_entity_count() {
    let dir = format!(
        "{}/../../apps/workspace/test-fixtures/world-engine-spawner-demo",
        env!("CARGO_MANIFEST_DIR")
    );
    let prefab_path = std::path::Path::new(&dir).join("prefabs/enemy.prefab.json");
    if !prefab_path.exists() {
        return;
    }
    let mut world = World::new_empty();
    let prefab = load_prefab(&prefab_path).expect("load prefab");
    let before = world.entity_count();
    spawn_prefab_at(&mut world, &prefab, [0.0, 1.0, 0.0].into(), std::path::Path::new(&dir));
    assert!(world.entity_count() > before);
}
