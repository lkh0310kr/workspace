use std::collections::{BTreeMap, BTreeSet, VecDeque};

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::catalog::board_pins;
use crate::mcu::GpioEvent;
use crate::model::{Endpoint, HardwareProject};
use crate::validate::validate_project;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PinState {
    High,
    Low,
    HighImpedance,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ComponentState {
    pub component_id: String,
    pub state: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuntimeState {
    pub time_ns: u64,
    pub pins: BTreeMap<String, PinState>,
    pub components: BTreeMap<String, ComponentState>,
}

pub struct Simulator {
    project: HardwareProject,
    button_pressed: BTreeMap<String, bool>,
    driven_pins: BTreeMap<Endpoint, PinState>,
    runtime: RuntimeState,
}

impl Simulator {
    pub fn new(project: HardwareProject) -> Result<Self> {
        let validation = validate_project(&project);
        if !validation.is_empty() {
            return Err(anyhow!(
                "invalid Hardware-as-Code: {}",
                serde_json::to_string(&validation)?
            ));
        }

        let button_pressed = project
            .components
            .iter()
            .filter(|component| component.component_type == "button")
            .map(|component| (component.id.clone(), false))
            .collect();
        let mut simulator = Self {
            project,
            button_pressed,
            driven_pins: BTreeMap::new(),
            runtime: RuntimeState {
                time_ns: 0,
                pins: BTreeMap::new(),
                components: BTreeMap::new(),
            },
        };
        simulator.recompute();
        Ok(simulator)
    }

    pub fn set_button_pressed(&mut self, component_id: &str, pressed: bool) -> Result<()> {
        let state = self
            .button_pressed
            .get_mut(component_id)
            .ok_or_else(|| anyhow!("'{component_id}' is not a button"))?;
        *state = pressed;
        Ok(())
    }

    pub fn step_ns(&mut self, delta_ns: u64) {
        self.runtime.time_ns = self.runtime.time_ns.saturating_add(delta_ns);
        self.recompute();
    }

    pub fn apply_gpio_event(&mut self, event: GpioEvent) -> Result<()> {
        if event.t_ns < self.runtime.time_ns {
            return Err(anyhow!(
                "GPIO event time {} precedes runtime time {}",
                event.t_ns,
                self.runtime.time_ns
            ));
        }
        let known_pin = board_pins(&self.project.board.board_type)
            .is_some_and(|pins| pins.contains(&event.pin));
        if !known_pin {
            return Err(anyhow!(
                "'{}' is not a pin on board type '{}'",
                event.pin,
                self.project.board.board_type
            ));
        }
        self.runtime.time_ns = event.t_ns;
        self.driven_pins.insert(
            Endpoint {
                node_id: self.project.board.id.clone(),
                pin_id: event.pin,
            },
            event.level,
        );
        self.recompute();
        Ok(())
    }

    pub fn runtime(&self) -> &RuntimeState {
        &self.runtime
    }

    pub fn component_bool(&self, component_id: &str, key: &str) -> Option<bool> {
        self.runtime
            .components
            .get(component_id)?
            .state
            .get(key)?
            .as_bool()
    }

    fn recompute(&mut self) {
        let graph = self.conductive_graph();
        let mut high_sources = ["5V", "3V3"]
            .into_iter()
            .map(|pin_id| Endpoint {
                node_id: self.project.board.id.clone(),
                pin_id: pin_id.into(),
            })
            .collect::<Vec<_>>();
        high_sources.extend(
            self.driven_pins
                .iter()
                .filter_map(|(pin, state)| (*state == PinState::High).then_some(pin.clone())),
        );
        let mut low_sources = vec![Endpoint {
            node_id: self.project.board.id.clone(),
            pin_id: "GND".into(),
        }];
        low_sources.extend(
            self.driven_pins
                .iter()
                .filter_map(|(pin, state)| (*state == PinState::Low).then_some(pin.clone())),
        );
        let high = reachable_from(&graph, high_sources);
        let low = reachable_from(&graph, low_sources);

        let all_endpoints: BTreeSet<_> = graph
            .keys()
            .cloned()
            .chain(high.iter().cloned())
            .chain(low.iter().cloned())
            .collect();
        self.runtime.pins = all_endpoints
            .into_iter()
            .map(|endpoint| {
                let state = match (high.contains(&endpoint), low.contains(&endpoint)) {
                    (true, false) => PinState::High,
                    (false, true) => PinState::Low,
                    (true, true) => PinState::Unknown,
                    (false, false) => PinState::HighImpedance,
                };
                (endpoint.key(), state)
            })
            .collect();

        let mut components = BTreeMap::new();
        for component in &self.project.components {
            let mut state = BTreeMap::new();
            match component.component_type.as_str() {
                "button" => {
                    state.insert(
                        "pressed".into(),
                        Value::Bool(*self.button_pressed.get(&component.id).unwrap_or(&false)),
                    );
                }
                "led" => {
                    let anode = Endpoint {
                        node_id: component.id.clone(),
                        pin_id: "a".into(),
                    };
                    let cathode = Endpoint {
                        node_id: component.id.clone(),
                        pin_id: "k".into(),
                    };
                    let on = high.contains(&anode) && low.contains(&cathode);
                    state.insert("on".into(), Value::Bool(on));
                }
                _ => {}
            }
            components.insert(
                component.id.clone(),
                ComponentState {
                    component_id: component.id.clone(),
                    state,
                },
            );
        }
        self.runtime.components = components;
    }

    fn conductive_graph(&self) -> Graph {
        let mut graph = Graph::new();
        for connection in &self.project.connections {
            if let (Some(from), Some(to)) = (
                Endpoint::parse(&connection.from),
                Endpoint::parse(&connection.to),
            ) {
                add_edge(&mut graph, from, to);
            }
        }

        for component in &self.project.components {
            let endpoints = |a: &str, b: &str| {
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
                    let (a, b) = endpoints("a", "b");
                    add_edge(&mut graph, a, b);
                }
                "button" if self.button_pressed.get(&component.id) == Some(&true) => {
                    let (a, b) = endpoints("a", "b");
                    add_edge(&mut graph, a, b);
                }
                // LED direction/state is evaluated across its two sides; it is
                // intentionally not an ideal wire in the connectivity graph.
                _ => {}
            }
        }
        graph
    }
}

type Graph = BTreeMap<Endpoint, Vec<Endpoint>>;

fn add_edge(graph: &mut Graph, a: Endpoint, b: Endpoint) {
    graph.entry(a.clone()).or_default().push(b.clone());
    graph.entry(b).or_default().push(a);
}

fn reachable_from(
    graph: &Graph,
    sources: impl IntoIterator<Item = Endpoint>,
) -> BTreeSet<Endpoint> {
    let mut seen = BTreeSet::new();
    let mut queue: VecDeque<_> = sources.into_iter().collect();
    while let Some(current) = queue.pop_front() {
        if !seen.insert(current.clone()) {
            continue;
        }
        for next in graph.get(&current).into_iter().flatten() {
            queue.push_back(next.clone());
        }
    }
    seen
}
