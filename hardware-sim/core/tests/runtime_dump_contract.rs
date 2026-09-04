//! Phase 64 — deterministic, agent-readable runtime dump contract.

use hardware_sim_core::{
    load_project, runtime_dump_json, write_runtime_dump, GpioEvent, RuntimeState, Simulator,
};

const FIXTURE_DIR: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../apps/workspace/test-fixtures/hardware-blink"
);

fn replay_blink() -> RuntimeState {
    let project = load_project(format!("{FIXTURE_DIR}/hardware-sim.json")).unwrap();
    let timeline: Vec<GpioEvent> = serde_json::from_str(
        &std::fs::read_to_string(format!("{FIXTURE_DIR}/gpio-timeline.json")).unwrap(),
    )
    .unwrap();
    let mut simulator = Simulator::new(project).unwrap();
    for event in timeline {
        simulator.apply_gpio_event(event).unwrap();
    }
    simulator.runtime().clone()
}

#[test]
fn one_second_blink_dump_matches_stable_snapshot() {
    let state = replay_blink();
    let expected = std::fs::read_to_string(format!("{FIXTURE_DIR}/runtime.expected.json")).unwrap();

    assert_eq!(runtime_dump_json(&state).unwrap(), expected);
}

#[test]
fn runtime_dump_file_can_be_replaced_and_read_back() {
    let path = std::env::temp_dir().join(format!(
        "hardware-sim-runtime-contract-{}.json",
        std::process::id()
    ));
    let state = replay_blink();

    write_runtime_dump(
        &path,
        &RuntimeState {
            time_ns: 0,
            pins: Default::default(),
            components: Default::default(),
        },
    )
    .unwrap();
    write_runtime_dump(&path, &state).unwrap();

    let dumped: RuntimeState =
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    assert_eq!(dumped, state);
    std::fs::remove_file(path).unwrap();
}
