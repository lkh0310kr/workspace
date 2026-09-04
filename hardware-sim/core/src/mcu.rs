use serde::{Deserialize, Serialize};

use crate::PinState;

/// Timestamped MCU GPIO output consumed by the circuit kernel.
///
/// `pin` is board-local (`D13`), not an avr8js port/register name. The
/// delegate owns ATmega328P Port B → Arduino pin mapping.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GpioEvent {
    pub t_ns: u64,
    pub pin: String,
    pub level: PinState,
}
