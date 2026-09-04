//! Phase 61 — machine-readable validation contract.

use hardware_sim_core::{load_project, validate_project, ConnectionSpec};

const FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../apps/workspace/test-fixtures/hardware-button-led/hardware-sim.json"
);

const SHORT_FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../apps/workspace/test-fixtures/hardware-short-power-gnd/hardware-sim.json"
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

#[test]
fn direct_power_ground_wire_has_stable_error_code() {
    let project = load_project(SHORT_FIXTURE).unwrap();
    let errors = validate_project(&project);
    assert!(errors.iter().any(|error| {
        error.code == "POWER_GROUND_SHORT" && error.target.as_deref() == Some("uno.5V")
    }));
}

#[test]
fn closed_button_from_5v_to_gnd_is_a_short() {
    let mut project = load_project(FIXTURE).unwrap();
    project
        .components
        .retain(|component| component.id == "button1");
    project.connections = vec![
        ConnectionSpec {
            from: "uno.5V".into(),
            to: "button1.a".into(),
        },
        ConnectionSpec {
            from: "button1.b".into(),
            to: "uno.GND".into(),
        },
    ];

    let errors = validate_project(&project);
    assert!(errors
        .iter()
        .any(|error| error.code == "POWER_GROUND_SHORT"));
}

#[test]
fn resistor_between_power_and_ground_is_not_a_short() {
    let mut project = load_project(FIXTURE).unwrap();
    project.components.retain(|component| component.id == "r1");
    project.connections = vec![
        ConnectionSpec {
            from: "uno.5V".into(),
            to: "r1.a".into(),
        },
        ConnectionSpec {
            from: "r1.b".into(),
            to: "uno.GND".into(),
        },
    ];

    let errors = validate_project(&project);
    assert!(
        errors
            .iter()
            .all(|error| error.code != "POWER_GROUND_SHORT"),
        "{errors:?}"
    );
}

#[test]
fn led_source_requires_digital_output_capability() {
    let mut project = load_project(FIXTURE).unwrap();
    project.connections[0].from = "uno.A0".into();

    let errors = validate_project(&project);
    assert!(errors.iter().any(|error| {
        error.code == "LED_OUTPUT_CAPABILITY_REQUIRED" && error.target.as_deref() == Some("led1")
    }));
    assert!(errors
        .iter()
        .all(|error| error.code != "LED_RESISTOR_REQUIRED"));
}
