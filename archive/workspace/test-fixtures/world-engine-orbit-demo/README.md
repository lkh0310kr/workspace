# world-engine-orbit-demo

무중력 **궤도 운동**입니다. 달 kinematic body가 `entity_pos("planet")`(Godot node 조회 패턴)를 이용해 고정된 행성 주위를 돕니다.

```sh
./world-engine/qt-shell/target/debug/world-engine-qt-shell \
  apps/workspace/test-fixtures/world-engine-orbit-demo
```

headless 실행: `world-engine/core`에서 `cargo test orbit_script_circles_planet`을 실행합니다.
