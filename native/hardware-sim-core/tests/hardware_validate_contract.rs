//! Phase 61 — machine-readable validation contract.

use hardware_sim_core::{load_project, validate_project};

const FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../electron/test-fixtures/hardware-button-led/hardware-sim.json"
);

#[test]
fn button_led_fixture_is_valid() {
    let project = load_project(FIXTURE).unwrap();
    assert_eq!(validate_project(&project), vec![]);
}

#[test]
fn led_without_resistor_has_stable_error_code() {
    let mut project = load_project(FIXTURE).unwrap();
    project.components.retain(|component| component.id != "r1");
    project.connections[0].to = "led1.a".into();
    project.connections.remove(1);

    let errors = validate_project(&project);
    assert!(errors.iter().any(|error| {
        error.code == "LED_RESISTOR_REQUIRED" && error.target.as_deref() == Some("led1")
    }));
}

#[test]
fn unknown_pin_has_stable_error_code() {
    let mut project = load_project(FIXTURE).unwrap();
    project.connections[0].from = "uno.D99".into();

    let errors = validate_project(&project);
    assert!(errors.iter().any(|error| {
        error.code == "UNKNOWN_PIN" && error.target.as_deref() == Some("uno.D99")
    }));
}
