# world-engine-zero-g-demo

**무중력 당구** — script 없는 순수 물리 데모입니다. 미소중력 상자에서 탄성 구체 세 개가 움직입니다(Gazebo/PhysX sandbox 패턴).

```sh
./world-engine/qt-shell/target/debug/world-engine-qt-shell \
  apps/workspace/test-fixtures/world-engine-zero-g-demo
```

JSON의 `position`을 조정하거나 나중에 velocity를 추가해 공을 처음 밀어낼 수 있습니다. v1에서는 낙하와 벽 반사를 사용합니다.
