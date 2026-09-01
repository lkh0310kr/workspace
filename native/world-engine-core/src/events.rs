//! Collision events (Godot signals / Unity OnCollisionEnter).

use hecs::Entity;

/// One collision notification for an entity this step.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CollisionEvent {
    pub other_name: String,
    pub started: bool,
}

/// Per-entity collision events queued during `World::step()` (drained by scripts).
#[derive(Default)]
pub struct CollisionEventBuffer {
    events: std::collections::HashMap<Entity, Vec<CollisionEvent>>,
}

impl CollisionEventBuffer {
    pub fn push(&mut self, entity: Entity, event: CollisionEvent) {
        self.events.entry(entity).or_default().push(event);
    }

    pub fn drain_for(&mut self, entity: Entity) -> Vec<CollisionEvent> {
        self.events.remove(&entity).unwrap_or_default()
    }

    pub fn clear(&mut self) {
        self.events.clear();
    }
}
