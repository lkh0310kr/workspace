# world-engine-chase-demo

**프로젝트별 Rhai script**를 사용하는 headless **추적(chase)** 시뮬레이션입니다. 로직은 `world-engine/core/examples/chase.rs`와 같지만, script가 엔진 바이너리가 아니라 이 폴더에 있어 Godot 방식으로 격리됩니다.

## 구조

```
world-engine-chase-demo/
  world-engine.json      # scene + entity names + script paths
  scripts/
    chase.rhai           # per-entity logic (chaser only)
```

## 실행 (화면 표시)

`world-engine-qt-shell`을 빌드한 뒤 저장소 root에서 실행:

```sh
./world-engine/qt-shell/target/debug/world-engine-qt-shell \
  apps/workspace/test-fixtures/world-engine-chase-demo
```

또는 Workspace에서 TreeView → `world-engine.json`이 있는 폴더 → **Open in World Engine**을 선택합니다.

## 실행 (headless 테스트)

```sh
cd world-engine/core
cargo test entity_script_moves_kinematic_body
```

## 확인 항목

- 녹색 구체(chaser)가 빨간 target 쪽으로 이동해 근처에서 멈춥니다.
- `entity_pos("target")`을 사용하며 `script_args`에 좌표를 고정하지 않습니다.
- `script_args.speed`를 조정하거나 `scripts/chase.rhai`만 편집해 속도를 변경합니다.
