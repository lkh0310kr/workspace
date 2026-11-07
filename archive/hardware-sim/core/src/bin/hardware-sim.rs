use std::io::{self, BufRead, Write};
use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use hardware_sim_core::{
    load_project, runtime_dump_json, write_runtime_dump, GpioEvent, RuntimeCommand, RuntimeMessage,
    Simulator,
};

const USAGE: &str = "usage:
  hardware-sim <hardware-sim.json>
  hardware-sim <hardware-sim.json> [--replay-gpio <timeline.json>] (--dump <runtime.json> | --dump-stdout)";

struct Options {
    project_path: PathBuf,
    replay_gpio: Option<PathBuf>,
    dump_path: Option<PathBuf>,
    dump_stdout: bool,
}

fn emit(message: RuntimeMessage) -> Result<()> {
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, &message)?;
    stdout.write_all(b"\n")?;
    stdout.flush()?;
    Ok(())
}

fn main() -> Result<()> {
    let options = parse_options()?;
    let mut simulator = Simulator::new(load_project(&options.project_path)?)?;

    if let Some(timeline_path) = &options.replay_gpio {
        let timeline: Vec<GpioEvent> = serde_json::from_slice(
            &std::fs::read(timeline_path)
                .with_context(|| format!("failed to read '{}'", timeline_path.display()))?,
        )
        .with_context(|| format!("invalid GPIO timeline '{}'", timeline_path.display()))?;
        for event in timeline {
            simulator.apply_gpio_event(event)?;
        }
    }

    if options.dump_stdout {
        io::stdout()
            .write_all(runtime_dump_json(simulator.runtime())?.as_bytes())
            .context("failed to write runtime dump to stdout")?;
        return Ok(());
    }
    if let Some(dump_path) = options.dump_path {
        write_runtime_dump(dump_path, simulator.runtime())?;
        return Ok(());
    }

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

fn parse_options() -> Result<Options> {
    let mut args = std::env::args().skip(1);
    let project_path = PathBuf::from(args.next().context(USAGE)?);
    let mut replay_gpio = None;
    let mut dump_path = None;
    let mut dump_stdout = false;

    while let Some(argument) = args.next() {
        match argument.as_str() {
            "--replay-gpio" => {
                replay_gpio = Some(PathBuf::from(args.next().context(USAGE)?));
            }
            "--dump" => {
                dump_path = Some(PathBuf::from(args.next().context(USAGE)?));
            }
            "--dump-stdout" => dump_stdout = true,
            _ => bail!("unknown argument '{argument}'\n{USAGE}"),
        }
    }

    if dump_stdout && dump_path.is_some() {
        bail!("--dump and --dump-stdout are mutually exclusive\n{USAGE}");
    }
    if replay_gpio.is_some() && !dump_stdout && dump_path.is_none() {
        bail!("--replay-gpio requires --dump or --dump-stdout\n{USAGE}");
    }

    Ok(Options {
        project_path,
        replay_gpio,
        dump_path,
        dump_stdout,
    })
}
