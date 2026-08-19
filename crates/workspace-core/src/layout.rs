use serde_json::Value;

pub fn default_layout(terminal_id: u32) -> String {
    serde_json::json!({
        "global": {
            "tabEnableClose": true,
            "tabSetEnableMaximize": false,
            "tabSetEnableDrop": true,
            "tabSetEnableTabStrip": false,
            "tabSetEnableSingleTabStretch": false,
            "tabEnableRenderOnDemand": false,
            "tabEnableRename": false,
            "splitterSize": 1,
            "splitterExtra": 8,
        },
        "borders": [],
        "layout": {
            "type": "row",
            "children": [{
                "type": "tabset",
                "weight": 100,
                "children": [{
                    "type": "tab",
                    "id": format!("terminal-{terminal_id}"),
                    "name": "Terminal",
                    "component": "terminal",
                    "config": { "terminalId": terminal_id }
                }]
            }]
        }
    })
    .to_string()
}

pub fn extract_terminal_ids(layout_json: &str) -> Vec<u32> {
    let Ok(value) = serde_json::from_str::<Value>(layout_json) else {
        return Vec::new();
    };
    let mut ids = Vec::new();
    walk_layout(&value, &mut ids);
    ids.sort_unstable();
    ids.dedup();
    ids
}

fn walk_layout(value: &Value, ids: &mut Vec<u32>) {
    match value {
        Value::Object(map) => {
            if map.get("component").and_then(Value::as_str) == Some("terminal") {
                if let Some(id) = map
                    .get("config")
                    .and_then(|c| c.get("terminalId"))
                    .and_then(Value::as_u64)
                {
                    ids.push(id as u32);
                }
            }
            for child in map.values() {
                walk_layout(child, ids);
            }
        }
        Value::Array(items) => {
            for item in items {
                walk_layout(item, ids);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_layout_contains_terminal() {
        let json = default_layout(7);
        assert_eq!(extract_terminal_ids(&json), vec![7]);
    }

    #[test]
    fn extracts_multiple_terminal_ids() {
        let json = r#"{
            "layout": {
                "type": "row",
                "children": [
                    {"type":"tab","component":"terminal","config":{"terminalId":1}},
                    {"type":"tab","component":"code"},
                    {"type":"tab","component":"terminal","config":{"terminalId":2}}
                ]
            }
        }"#;
        assert_eq!(extract_terminal_ids(json), vec![1, 2]);
    }
}
