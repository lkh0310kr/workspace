use std::collections::{BTreeMap, BTreeSet, VecDeque};

use serde::{Deserialize, Serialize};

use crate::catalog::{board_digital_output_pins, board_pins, component_pins};
use crate::model::{Endpoint, HardwareProject};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValidationError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
}

impl ValidationError {
    fn new(code: &str, message: impl Into<String>, target: Option<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            target,
        }
    }
}

pub fn validate_project(project: &HardwareProject) -> Vec<ValidationError> {
    let mut errors = Vec::new();

    if project.version != 1 {
        errors.push(ValidationError::new(
            "UNSUPPORTED_VERSION",
            format!("hardware-sim version {} is not supported", project.version),
            Some("version".into()),
        ));
    }

    let board_pin_set = match board_pins(&project.board.board_type) {
        Some(pins) => pins.into_iter().collect::<BTreeSet<_>>(),
        None => {
            errors.push(ValidationError::new(
                "UNSUPPORTED_BOARD",
                format!("board type '{}' is not supported", project.board.board_type),
                Some(project.board.id.clone()),
            ));
            BTreeSet::new()
        }
    };

    let mut nodes = BTreeMap::new();
    nodes.insert(project.board.id.as_str(), None);
    for component in &project.components {
        if nodes
            .insert(
                component.id.as_str(),
                Some(component.component_type.as_str()),
            )
            .is_some()
        {
            errors.push(ValidationError::new(
                "DUPLICATE_NODE_ID",
                format!("node id '{}' is duplicated", component.id),
                Some(component.id.clone()),
            ));
        }
        if component_pins(&component.component_type).is_none() {
            errors.push(ValidationError::new(
                "UNSUPPORTED_COMPONENT",
                format!(
                    "component type '{}' is not supported",
                    component.component_type
                ),
                Some(component.id.clone()),
            ));
        }
        if component.component_type == "resistor"
            && component
                .params
                .get("ohm")
                .and_then(|value| value.as_f64())
                .is_none_or(|ohm| ohm <= 0.0)
        {
            errors.push(ValidationError::new(
                "INVALID_RESISTANCE",
                "resistor requires a positive numeric params.ohm",
                Some(component.id.clone()),
            ));
        }
    }

    for (index, connection) in project.connections.iter().enumerate() {
        for raw in [&connection.from, &connection.to] {
            let Some(endpoint) = Endpoint::parse(raw) else {
                errors.push(ValidationError::new(
                    "INVALID_ENDPOINT",
                    format!("endpoint '{raw}' must be node.pin"),
                    Some(format!("connections[{index}]")),
                ));
                continue;
            };
            match nodes.get(endpoint.node_id.as_str()) {
                None => errors.push(ValidationError::new(
                    "UNKNOWN_NODE",
                    format!("node '{}' does not exist", endpoint.node_id),
                    Some(raw.clone()),
                )),
                Some(None) => {
                    if !board_pin_set.contains(&endpoint.pin_id) {
                        errors.push(ValidationError::new(
                            "UNKNOWN_PIN",
                            format!("pin '{}' does not exist on the board", endpoint.pin_id),
                            Some(raw.clone()),
                        ));
                    }
                }
                Some(Some(component_type)) => {
                    let known = component_pins(component_type)
                        .is_some_and(|pins| pins.contains(&endpoint.pin_id.as_str()));
                    if !known {
                        errors.push(ValidationError::new(
                            "UNKNOWN_PIN",
                            format!(
                                "pin '{}' does not exist on component type '{}'",
                                endpoint.pin_id, component_type
                            ),
                            Some(raw.clone()),
                        ));
                    }
                }
            }
        }
    }

    // Graph checks only make sense after all references are valid.
    if errors.iter().any(|error| {
        matches!(
            error.code.as_str(),
            "UNKNOWN_NODE" | "UNKNOWN_PIN" | "INVALID_ENDPOINT"
        )
    }) {
        return errors;
    }

    let graph = structural_graph(project);
    let power = [
        Endpoint {
            node_id: project.board.id.clone(),
            pin_id: "5V".into(),
        },
        Endpoint {
            node_id: project.board.id.clone(),
            pin_id: "3V3".into(),
        },
    ];
    let ground = Endpoint {
        node_id: project.board.id.clone(),
        pin_id: "GND".into(),
    };
    let mut led_sources = power.to_vec();
    if let Some(digital_pins) = board_digital_output_pins(&project.board.board_type) {
        led_sources.extend(digital_pins.into_iter().map(|pin_id| Endpoint {
            node_id: project.board.id.clone(),
            pin_id,
        }));
    }
    let any_board_source = board_pin_set
        .iter()
        .filter(|pin_id| pin_id.as_str() != "GND")
        .map(|pin_id| Endpoint {
            node_id: project.board.id.clone(),
            pin_id: pin_id.clone(),
        })
        .collect::<Vec<_>>();

    let shorts = short_graph(project);
    for rail in &power {
        if is_reachable(&shorts, rail, &ground) {
            errors.push(ValidationError::new(
                "POWER_GROUND_SHORT",
                format!(
                    "{} is shorted to ground by a wire or closed button (no resistor in the path)",
                    rail.key()
                ),
                Some(rail.key()),
            ));
        }
    }

    for led in project
        .components
        .iter()
        .filter(|component| component.component_type == "led")
    {
        let anode = Endpoint {
            node_id: led.id.clone(),
            pin_id: "a".into(),
        };
        let cathode = Endpoint {
            node_id: led.id.clone(),
            pin_id: "k".into(),
        };
        if !reaches_power_through_resistor(&graph, &anode, &led_sources) {
            if reaches_power_through_resistor(&graph, &anode, &any_board_source) {
                errors.push(ValidationError::new(
                    "LED_OUTPUT_CAPABILITY_REQUIRED",
                    "LED anode source must be a power rail or digital output pin",
                    Some(led.id.clone()),
                ));
            } else {
                errors.push(ValidationError::new(
                    "LED_RESISTOR_REQUIRED",
                    "LED anode must reach board power or a digital output through a resistor",
                    Some(led.id.clone()),
                ));
            }
        }
        if !is_reachable(&graph, &cathode, &ground) {
            errors.push(ValidationError::new(
                "LED_GROUND_REQUIRED",
                "LED cathode must reach board ground (a button may be in the path)",
                Some(led.id.clone()),
            ));
        }
    }

    errors
}

type StructuralGraph = BTreeMap<Endpoint, Vec<(Endpoint, bool)>>;

fn add_edge(graph: &mut StructuralGraph, a: Endpoint, b: Endpoint, resistor: bool) {
    graph
        .entry(a.clone())
        .or_default()
        .push((b.clone(), resistor));
    graph.entry(b).or_default().push((a, resistor));
}

fn structural_graph(project: &HardwareProject) -> StructuralGraph {
    let mut graph = StructuralGraph::new();
    for connection in &project.connections {
        if let (Some(from), Some(to)) = (
            Endpoint::parse(&connection.from),
            Endpoint::parse(&connection.to),
        ) {
            add_edge(&mut graph, from, to, false);
        }
    }
    for component in &project.components {
        let pins = |a: &str, b: &str| {
            (
                Endpoint {
                    node_id: component.id.clone(),
                    pin_id: a.into(),
                },
                Endpoint {
                    node_id: component.id.clone(),
                    pin_id: b.into(),
                },
            )
        };
        match component.component_type.as_str() {
            "resistor" => {
                let (a, b) = pins("a", "b");
                add_edge(&mut graph, a, b, true);
            }
            // Validation asks whether a valid path exists when the button is closed.
            "button" => {
                let (a, b) = pins("a", "b");
                add_edge(&mut graph, a, b, false);
            }
            // The LED is intentionally a break: check each side independently.
            _ => {}
        }
    }
    graph
}

/// Wires and closed buttons only. A resistor is a load, not a short.
fn short_graph(project: &HardwareProject) -> StructuralGraph {
    let mut graph = StructuralGraph::new();
    for connection in &project.connections {
        if let (Some(from), Some(to)) = (
            Endpoint::parse(&connection.from),
            Endpoint::parse(&connection.to),
        ) {
            add_edge(&mut graph, from, to, false);
        }
    }
    for component in &project.components {
        if component.component_type != "button" {
            continue;
        }
        add_edge(
            &mut graph,
            Endpoint {
                node_id: component.id.clone(),
                pin_id: "a".into(),
            },
            Endpoint {
                node_id: component.id.clone(),
                pin_id: "b".into(),
            },
            false,
        );
    }
    graph
}

fn is_reachable(graph: &StructuralGraph, start: &Endpoint, target: &Endpoint) -> bool {
    let mut seen = BTreeSet::new();
    let mut queue = VecDeque::from([start.clone()]);
    while let Some(current) = queue.pop_front() {
        if current == *target {
            return true;
        }
        if !seen.insert(current.clone()) {
            continue;
        }
        for (next, _) in graph.get(&current).into_iter().flatten() {
            queue.push_back(next.clone());
        }
    }
    false
}

fn reaches_power_through_resistor(
    graph: &StructuralGraph,
    start: &Endpoint,
    power: &[Endpoint],
) -> bool {
    let mut seen = BTreeSet::new();
    let mut queue = VecDeque::from([(start.clone(), false)]);
    while let Some((current, has_resistor)) = queue.pop_front() {
        if has_resistor && power.contains(&current) {
            return true;
        }
        if !seen.insert((current.clone(), has_resistor)) {
            continue;
        }
        for (next, resistor) in graph.get(&current).into_iter().flatten() {
            queue.push_back((next.clone(), has_resistor || *resistor));
        }
    }
    false
}
