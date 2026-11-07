use std::collections::BTreeMap;
use std::path::Path;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HardwareProject {
    pub version: u32,
    pub board: BoardSpec,
    #[serde(default)]
    pub components: Vec<ComponentSpec>,
    #[serde(default)]
    pub connections: Vec<ConnectionSpec>,
    #[serde(default)]
    pub firmware: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BoardSpec {
    pub id: String,
    #[serde(rename = "type")]
    pub board_type: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ComponentSpec {
    pub id: String,
    #[serde(rename = "type")]
    pub component_type: String,
    #[serde(default)]
    pub params: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConnectionSpec {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Endpoint {
    pub node_id: String,
    pub pin_id: String,
}

impl Endpoint {
    pub fn parse(value: &str) -> Option<Self> {
        let (node_id, pin_id) = value.split_once('.')?;
        if node_id.is_empty() || pin_id.is_empty() || pin_id.contains('.') {
            return None;
        }
        Some(Self {
            node_id: node_id.to_owned(),
            pin_id: pin_id.to_owned(),
        })
    }

    pub fn key(&self) -> String {
        format!("{}.{}", self.node_id, self.pin_id)
    }
}

pub fn load_project(path: impl AsRef<Path>) -> Result<HardwareProject> {
    let path = path.as_ref();
    let contents = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read Hardware-as-Code at {}", path.display()))?;
    serde_json::from_str(&contents)
        .with_context(|| format!("invalid Hardware-as-Code at {}", path.display()))
}
