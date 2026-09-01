//! Frame-snapshot input state (Unity Input / Godot InputMap pattern).

use std::collections::HashSet;

use serde::Deserialize;

/// Maps logical actions (`move_x`, `jump`) to keys or axis pairs.
#[derive(Clone, Default, Debug)]
pub struct InputMap {
    bindings: std::collections::HashMap<String, InputBinding>,
}

#[derive(Clone, Debug)]
pub enum InputBinding {
    Key(String),
    Axis { negative: String, positive: String },
}

impl InputMap {
    pub fn from_json(map: &std::collections::HashMap<String, serde_json::Value>) -> Self {
        let mut bindings = std::collections::HashMap::new();
        for (action, value) in map {
            if let Some(binding) = parse_binding(value) {
                bindings.insert(action.clone(), binding);
            }
        }
        Self { bindings }
    }

    pub fn axis(&self, state: &InputState, action: &str) -> f32 {
        match self.bindings.get(action) {
            Some(InputBinding::Axis { negative, positive }) => {
                let neg = state.is_key_down(negative);
                let pos = state.is_key_down(positive);
                pos as i32 as f32 - neg as i32 as f32
            }
            _ => 0.0,
        }
    }

    pub fn is_action_down(&self, state: &InputState, action: &str) -> bool {
        match self.bindings.get(action) {
            Some(InputBinding::Key(key)) => state.is_key_down(key),
            Some(InputBinding::Axis { negative, positive }) => {
                state.is_key_down(negative) || state.is_key_down(positive)
            }
            None => false,
        }
    }

    pub fn is_action_pressed(&self, state: &InputState, action: &str) -> bool {
        match self.bindings.get(action) {
            Some(InputBinding::Key(key)) => state.is_key_pressed(key),
            Some(InputBinding::Axis { negative, positive }) => {
                state.is_key_pressed(negative) || state.is_key_pressed(positive)
            }
            None => false,
        }
    }
}

fn parse_binding(value: &serde_json::Value) -> Option<InputBinding> {
    match value {
        serde_json::Value::String(key) => Some(InputBinding::Key(key.clone())),
        serde_json::Value::Object(map) => {
            let negative = map.get("negative").and_then(|v| v.as_str())?.to_string();
            let positive = map.get("positive").and_then(|v| v.as_str())?.to_string();
            Some(InputBinding::Axis { negative, positive })
        }
        _ => None,
    }
}

/// Per-frame keyboard state. Updated by the shell; read by scripts each `step()`.
#[derive(Clone, Default, Debug)]
pub struct InputState {
    down: HashSet<String>,
    pressed: HashSet<String>,
    released: HashSet<String>,
}

impl InputState {
    pub fn key_down(&mut self, key: impl Into<String>) {
        let key = key.into();
        if self.down.insert(key.clone()) {
            self.pressed.insert(key);
        }
    }

    pub fn key_up(&mut self, key: impl Into<String>) {
        let key = key.into();
        if self.down.remove(&key) {
            self.released.insert(key);
        }
    }

    pub fn is_key_down(&self, key: &str) -> bool {
        self.down.contains(key)
    }

    pub fn is_key_pressed(&self, key: &str) -> bool {
        self.pressed.contains(key)
    }

    /// Clears edge-triggered pressed/released after a simulation step.
    pub fn end_frame(&mut self) {
        self.pressed.clear();
        self.released.clear();
    }
}

/// Snapshot installed for Rhai for one step.
#[derive(Clone, Default)]
pub struct InputSnapshot {
    state: InputState,
    map: InputMap,
}

impl InputSnapshot {
    pub fn new(state: &InputState, map: &InputMap) -> Self {
        Self {
            state: state.clone(),
            map: map.clone(),
        }
    }

    pub fn axis(&self, action: &str) -> f32 {
        self.map.axis(&self.state, action)
    }

    pub fn pressed(&self, action: &str) -> bool {
        self.map.is_action_pressed(&self.state, action)
    }

    pub fn down(&self, action: &str) -> bool {
        self.map.is_action_down(&self.state, action)
    }
}

/// Qt `Qt::Key` → logical name used in `input_map` JSON.
pub fn key_name_from_qt(code: i32) -> Option<&'static str> {
    match code {
        65 => Some("A"),
        66 => Some("B"),
        68 => Some("D"),
        69 => Some("E"),
        70 => Some("F"),
        81 => Some("Q"),
        83 => Some("S"),
        87 => Some("W"),
        32 => Some("Space"),
        16777216 => Some("Escape"),
        16777220 => Some("Return"),
        16777232 => Some("Up"),
        16777234 => Some("Down"),
        16777231 => Some("Left"),
        16777233 => Some("Right"),
        16777248 => Some("Shift"),
        16777249 => Some("Control"),
        _ => None,
    }
}

#[derive(Deserialize, Default)]
pub struct InputMapDef {
    #[serde(flatten)]
    pub bindings: std::collections::HashMap<String, serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn axis_from_opposing_keys() {
        let mut map = InputMap::default();
        map.bindings.insert(
            "move_x".to_string(),
            InputBinding::Axis {
                negative: "A".to_string(),
                positive: "D".to_string(),
            },
        );
        let mut state = InputState::default();
        state.key_down("D");
        assert_eq!(map.axis(&state, "move_x"), 1.0);
        state.key_up("D");
        state.key_down("A");
        assert_eq!(map.axis(&state, "move_x"), -1.0);
    }
}
