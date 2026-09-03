use std::io::{self, BufRead, Write};

use anyhow::{Context, Result};
use hardware_sim_core::{load_project, RuntimeCommand, RuntimeMessage, Simulator};

fn emit(message: RuntimeMessage) -> Result<()> {
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, &message)?;
    stdout.write_all(b"\n")?;
    stdout.flush()?;
    Ok(())
}

fn main() -> Result<()> {
    let project_path = std::env::args()
        .nth(1)
        .context("usage: hardware-sim <path/to/hardware-sim.json>")?;
    let mut simulator = Simulator::new(load_project(&project_path)?)?;
    emit(RuntimeMessage::Ready {
        state: simulator.runtime().clone(),
    })?;

    for line in io::stdin().lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let command = match serde_json::from_str::<RuntimeCommand>(&line) {
            Ok(command) => command,
            Err(error) => {
                emit(RuntimeMessage::Error {
                    message: format!("invalid command: {error}"),
                })?;
                continue;
            }
        };
        match command {
            RuntimeCommand::SetButton {
                id,
                pressed,
                delta_ns,
            } => match simulator.set_button_pressed(&id, pressed) {
                Ok(()) => {
                    simulator.step_ns(delta_ns);
                    emit(RuntimeMessage::Runtime {
                        state: simulator.runtime().clone(),
                    })?;
                }
                Err(error) => emit(RuntimeMessage::Error {
                    message: error.to_string(),
                })?,
            },
            RuntimeCommand::ApplyGpio { event } => match simulator.apply_gpio_event(event) {
                Ok(()) => emit(RuntimeMessage::Runtime {
                    state: simulator.runtime().clone(),
                })?,
                Err(error) => emit(RuntimeMessage::Error {
                    message: error.to_string(),
                })?,
            },
            RuntimeCommand::GetRuntime => emit(RuntimeMessage::Runtime {
                state: simulator.runtime().clone(),
            })?,
            RuntimeCommand::Quit => break,
        }
    }
    Ok(())
}
