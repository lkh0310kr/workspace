# world-engine-chase-demo

Headless **chase** simulation using a **project-local Rhai script** — the same logic as `native/world-engine-core/examples/chase.rs`, but scripts live in this folder (Godot-style isolation), not in the engine binary.

## Layout

```
world-engine-chase-demo/
  world-engine.json      # scene + entity names + script paths
  scripts/
    chase.rhai           # per-entity logic (chaser only)
```

## Run (visual)

From repo root, with `world-engine-qt-shell` built:

```sh
./native/world-engine-qt-shell/target/debug/world-engine-qt-shell \
  electron/test-fixtures/world-engine-chase-demo
```

Or in Workspace: TreeView → folder with `world-engine.json` → **Open in World Engine**.

## Run (headless test)

```sh
cd native/world-engine-core
cargo test entity_script_moves_kinematic_body
```

## QA

- Green sphere (chaser) moves toward red target and stops near it.
- Uses `entity_pos("target")` — no hardcoded coordinates in `script_args`.
- Tweak speed via `script_args.speed` or edit `scripts/chase.rhai` only.
