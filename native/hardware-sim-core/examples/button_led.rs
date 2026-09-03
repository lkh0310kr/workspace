use hardware_sim_core::{load_project, Simulator};

fn main() -> anyhow::Result<()> {
    let fixture = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../electron/test-fixtures/hardware-button-led/hardware-sim.json"
    );
    let mut simulator = Simulator::new(load_project(fixture)?)?;

    println!("{}", serde_json::to_string_pretty(simulator.runtime())?);
    simulator.set_button_pressed("button1", true)?;
    simulator.step_ns(1);
    println!("{}", serde_json::to_string_pretty(simulator.runtime())?);
    simulator.set_button_pressed("button1", false)?;
    simulator.step_ns(1);
    println!("{}", serde_json::to_string_pretty(simulator.runtime())?);
    Ok(())
}
