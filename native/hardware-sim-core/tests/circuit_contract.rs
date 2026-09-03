//! Phase 62 — deterministic button → LED circuit contract.

use hardware_sim_core::{load_project, PinState, Simulator};

const FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../electron/test-fixtures/hardware-button-led/hardware-sim.json"
);

#[test]
fn pressing_button_turns_led_on_and_releasing_turns_it_off() {
    let project = load_project(FIXTURE).unwrap();
    let mut simulator = Simulator::new(project).unwrap();

    assert_eq!(simulator.component_bool("button1", "pressed"), Some(false));
    assert_eq!(simulator.component_bool("led1", "on"), Some(false));

    simulator.set_button_pressed("button1", true).unwrap();
    simulator.step_ns(1);
    assert_eq!(simulator.component_bool("button1", "pressed"), Some(true));
    assert_eq!(simulator.component_bool("led1", "on"), Some(true));
    assert_eq!(
        simulator.runtime().pins.get("led1.a"),
        Some(&PinState::High)
    );
    assert_eq!(simulator.runtime().pins.get("led1.k"), Some(&PinState::Low));

    simulator.set_button_pressed("button1", false).unwrap();
    simulator.step_ns(1);
    assert_eq!(simulator.component_bool("button1", "pressed"), Some(false));
    assert_eq!(simulator.component_bool("led1", "on"), Some(false));
    assert_eq!(simulator.runtime().time_ns, 2);
}

#[test]
fn runtime_dump_is_stable_json_for_agent_observation() {
    let project = load_project(FIXTURE).unwrap();
    let mut simulator = Simulator::new(project).unwrap();
    simulator.set_button_pressed("button1", true).unwrap();
    simulator.step_ns(10);

    let dump = serde_json::to_value(simulator.runtime()).unwrap();
    assert_eq!(dump["time_ns"], 10);
    assert_eq!(dump["components"]["button1"]["state"]["pressed"], true);
    assert_eq!(dump["components"]["led1"]["state"]["on"], true);
}

#[test]
fn shorted_power_rail_cannot_start_simulator() {
    let project = load_project(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../electron/test-fixtures/hardware-short-power-gnd/hardware-sim.json"
    ))
    .unwrap();
    let error = match Simulator::new(project) {
        Ok(_) => panic!("shorted netlist must not start"),
        Err(error) => error.to_string(),
    };
    assert!(error.contains("POWER_GROUND_SHORT"), "{error}");
}
