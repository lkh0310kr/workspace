//! Phase 60 — Hardware-as-Code load contract.

use hardware_sim_core::{load_project, Endpoint};

const FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../apps/workspace/test-fixtures/hardware-button-led/hardware-sim.json"
);

#[test]
fn button_led_fixture_loads_and_round_trips() {
    let project = load_project(FIXTURE).unwrap();
    assert_eq!(project.version, 1);
    assert_eq!(project.board.board_type, "arduino-uno");
    assert_eq!(project.components.len(), 3);
    assert_eq!(project.connections.len(), 4);

    let encoded = serde_json::to_string(&project).unwrap();
    let decoded = serde_json::from_str(&encoded).unwrap();
    assert_eq!(project, decoded);
}

#[test]
fn endpoint_requires_exact_node_dot_pin_shape() {
    assert_eq!(Endpoint::parse("uno.D13").unwrap().key(), "uno.D13");
    assert!(Endpoint::parse("D13").is_none());
    assert!(Endpoint::parse("uno.port.pin").is_none());
}
