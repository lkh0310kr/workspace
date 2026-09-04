//! Persistent JSON-lines shell contract for a future Electron pane.

use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

use hardware_sim_core::RuntimeMessage;

const FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../apps/workspace/test-fixtures/hardware-button-led/hardware-sim.json"
);
const BLINK_FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../apps/workspace/test-fixtures/hardware-blink/hardware-sim.json"
);
const BLINK_TIMELINE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../apps/workspace/test-fixtures/hardware-blink/gpio-timeline.json"
);
const BLINK_RUNTIME: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../apps/workspace/test-fixtures/hardware-blink/runtime.expected.json"
);

fn read_message(reader: &mut BufReader<std::process::ChildStdout>) -> RuntimeMessage {
    let mut line = String::new();
    reader.read_line(&mut line).unwrap();
    serde_json::from_str(&line).unwrap()
}

fn led_on(message: &RuntimeMessage) -> bool {
    let state = match message {
        RuntimeMessage::Ready { state } | RuntimeMessage::Runtime { state } => state,
        RuntimeMessage::Error { message } => panic!("unexpected protocol error: {message}"),
    };
    state.components["led1"].state["on"].as_bool().unwrap()
}

#[test]
fn json_lines_button_commands_drive_led_state() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_hardware-sim"))
        .arg(FIXTURE)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let mut stdout = BufReader::new(child.stdout.take().unwrap());

    assert!(!led_on(&read_message(&mut stdout)));

    writeln!(
        stdin,
        r#"{{"command":"set_button","id":"button1","pressed":true}}"#
    )
    .unwrap();
    stdin.flush().unwrap();
    assert!(led_on(&read_message(&mut stdout)));

    writeln!(
        stdin,
        r#"{{"command":"set_button","id":"button1","pressed":false}}"#
    )
    .unwrap();
    writeln!(stdin, r#"{{"command":"quit"}}"#).unwrap();
    stdin.flush().unwrap();
    assert!(!led_on(&read_message(&mut stdout)));

    assert!(child.wait().unwrap().success());
}

#[test]
fn json_lines_gpio_event_drives_blink_fixture() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_hardware-sim"))
        .arg(BLINK_FIXTURE)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let mut stdout = BufReader::new(child.stdout.take().unwrap());

    assert!(!led_on(&read_message(&mut stdout)));
    writeln!(
        stdin,
        r#"{{"command":"apply_gpio","event":{{"t_ns":0,"pin":"D13","level":"high"}}}}"#
    )
    .unwrap();
    writeln!(stdin, r#"{{"command":"quit"}}"#).unwrap();
    stdin.flush().unwrap();
    assert!(led_on(&read_message(&mut stdout)));
    assert!(child.wait().unwrap().success());
}

#[test]
fn replayed_gpio_timeline_dumps_runtime_to_stdout() {
    let output = Command::new(env!("CARGO_BIN_EXE_hardware-sim"))
        .args([
            BLINK_FIXTURE,
            "--replay-gpio",
            BLINK_TIMELINE,
            "--dump-stdout",
        ])
        .output()
        .unwrap();

    assert!(output.status.success());
    assert_eq!(
        String::from_utf8(output.stdout).unwrap(),
        std::fs::read_to_string(BLINK_RUNTIME).unwrap()
    );
}

#[test]
fn replayed_gpio_timeline_dumps_runtime_to_file() {
    let dump_path = std::env::temp_dir().join(format!(
        "hardware-sim-cli-contract-{}.json",
        std::process::id()
    ));
    let output = Command::new(env!("CARGO_BIN_EXE_hardware-sim"))
        .arg(BLINK_FIXTURE)
        .args(["--replay-gpio", BLINK_TIMELINE, "--dump"])
        .arg(&dump_path)
        .output()
        .unwrap();

    assert!(output.status.success());
    assert!(output.stdout.is_empty());
    assert_eq!(
        std::fs::read_to_string(&dump_path).unwrap(),
        std::fs::read_to_string(BLINK_RUNTIME).unwrap()
    );
    std::fs::remove_file(dump_path).unwrap();
}
