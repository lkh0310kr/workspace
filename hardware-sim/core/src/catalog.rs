pub(crate) fn board_pins(board_type: &str) -> Option<Vec<String>> {
    match board_type {
        "arduino-uno" => {
            let mut pins = vec!["5V".into(), "3V3".into(), "GND".into()];
            pins.extend((0..=13).map(|n| format!("D{n}")));
            pins.extend((0..=5).map(|n| format!("A{n}")));
            Some(pins)
        }
        _ => None,
    }
}

pub(crate) fn board_digital_output_pins(board_type: &str) -> Option<Vec<String>> {
    match board_type {
        "arduino-uno" => Some((0..=13).map(|n| format!("D{n}")).collect()),
        _ => None,
    }
}

pub(crate) fn component_pins(component_type: &str) -> Option<&'static [&'static str]> {
    match component_type {
        "resistor" => Some(&["a", "b"]),
        "led" => Some(&["a", "k"]),
        "button" => Some(&["a", "b"]),
        _ => None,
    }
}
