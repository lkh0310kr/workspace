use serde::{Deserialize, Serialize};

use crate::RuntimeState;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "command", rename_all = "snake_case")]
pub enum RuntimeCommand {
    SetButton {
        id: String,
        pressed: bool,
        #[serde(default = "default_delta_ns")]
        delta_ns: u64,
    },
    GetRuntime,
    Quit,
}

fn default_delta_ns() -> u64 {
    1
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RuntimeMessage {
    Ready { state: RuntimeState },
    Runtime { state: RuntimeState },
    Error { message: String },
}
