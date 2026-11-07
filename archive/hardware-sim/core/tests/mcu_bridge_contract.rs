//! Phase 63 — recorded MCU GPIO events drive the deterministic circuit.

use hardware_sim_core::{load_project, GpioEvent, PinState, Simulator};

const FIXTURE_DIR: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../apps/workspace/test-fixtures/hardware-blink"
);

#[test]
fn recorded_d13_timeline_blinks_led() {
    let project = load_project(format!("{FIXTURE_DIR}/hardware-sim.json")).unwrap();
    let timeline: Vec<GpioEvent> = serde_json::from_str(
        &std::fs::read_to_string(format!("{FIXTURE_DIR}/gpio-timeline.json")).unwrap(),
    )
    .unwrap();
    let mut simulator = Simulator::new(project).unwrap();

    assert_eq!(simulator.component_bool("led1", "on"), Some(false));
    let expected = [true, false, true];
    for (event, led_on) in timeline.into_iter().zip(expected) {
        simulator.apply_gpio_event(event).unwrap();
        assert_eq!(simulator.component_bool("led1", "on"), Some(led_on));
    }
    assert_eq!(simulator.runtime().time_ns, 1_000_000_000);
    assert_eq!(
        simulator.runtime().pins.get("uno.D13"),
        Some(&PinState::High)
    );
}

#[test]
fn gpio_events_must_be_monotonic_and_use_known_board_pins() {
    let project = load_project(format!("{FIXTURE_DIR}/hardware-sim.json")).unwrap();
    let mut simulator = Simulator::new(project).unwrap();
    simulator
        .apply_gpio_event(GpioEvent {
            t_ns: 10,
            pin: "D13".into(),
            level: PinState::High,
        })
        .unwrap();

    let old_event = simulator
        .apply_gpio_event(GpioEvent {
            t_ns: 9,
            pin: "D13".into(),
            level: PinState::Low,
        })
        .unwrap_err();
    assert!(old_event.to_string().contains("precedes runtime time"));

    let unknown_pin = simulator
        .apply_gpio_event(GpioEvent {
            t_ns: 11,
            pin: "D99".into(),
            level: PinState::High,
        })
        .unwrap_err();
    assert!(unknown_pin.to_string().contains("not a pin"));
}
