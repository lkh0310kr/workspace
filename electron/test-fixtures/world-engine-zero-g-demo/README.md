# world-engine-zero-g-demo

**Zero-G billiards** — pure physics, no scripts. Three elastic spheres in a microgravity box (Gazebo/PhysX sandbox pattern).

```sh
./native/world-engine-qt-shell/target/debug/world-engine-qt-shell \
  electron/test-fixtures/world-engine-zero-g-demo
```

Give the balls an initial shove by nudging them in the JSON `position` / adding velocity later — v1 uses drop + wall bounces.
