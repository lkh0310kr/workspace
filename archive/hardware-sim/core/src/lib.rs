//! AI-native hardware simulation core.
//!
//! Hardware-as-Code is a thin authoring layer over a deterministic digital
//! circuit runtime. MCU emulators are delegates that will exchange timestamped
//! pin events with this crate; they do not own the circuit model.

mod catalog;

pub mod circuit;
pub mod mcu;
pub mod model;
pub mod protocol;
pub mod runtime;
pub mod validate;

pub use circuit::{ComponentState, PinState, RuntimeState, Simulator};
pub use mcu::GpioEvent;
pub use model::{
    load_project, BoardSpec, ComponentSpec, ConnectionSpec, Endpoint, HardwareProject,
};
pub use protocol::{RuntimeCommand, RuntimeMessage};
pub use runtime::{runtime_dump_json, write_runtime_dump};
pub use validate::{validate_project, ValidationError};
