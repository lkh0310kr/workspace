fn on_world_update(dt, time) {
    let breed_b = entity_property_str("hen_b", "breed");
    let hunger_a = entity_property("hen_a", "hunger");
    set_sim_var("peer_breed", if breed_b == "broiler" { 1.0 } else { 0.0 });
    publish_metric("hen_a_hunger", hunger_a);
}
