# 3D model test fixtures

Sample assets for the in-app model viewer and import pipeline tests.

| File | Format | Source / license |
|------|--------|------------------|
| `box.glb` | GLB | Khronos glTF Sample Assets "Box" (CC0), copied from `world-engine-mesh-demo/` |
| `duck.glb` | GLB | Khronos glTF Sample Assets "Duck" (CC0) — fetched by script |
| `gltf-box/Box.gltf` + `Box0.bin` | GLTF package | Khronos "Box" glTF with external `.bin` (CC0) |
| `gltf-draco/Box.gltf` + `Box0.bin` | Draco glTF | Khronos "Box" Draco variant (CC0) |
| `cube.obj` + `cube.mtl` | OBJ package | Generated minimal cube with MTL (repo) |
| `cube.stl` | STL | Generated minimal cube (repo) |
| `box.fbx` | FBX | three.js `vCube.fbx` example (CC0) |

## Refresh

```bash
npm run models:fixtures
```

Remote downloads require network. `box.glb`, `cube.obj`, `cube.mtl`, and `cube.stl` work offline after the first run.

## Manual QA

1. Open a workspace rooted at `apps/workspace/test-fixtures/`.
2. Click `models/box.glb` or `models/duck.glb` in TreeView — orbit viewer should appear.
3. Click `models/gltf-box/Box.gltf` — textured box with external `.bin` should load.
4. Click `models/gltf-draco/Box.gltf` — Draco-compressed box should load (network required for decoder WASM on first load).
5. Click `models/cube.obj` — cube with MTL colors should render.
6. Click `models/cube.stl` — STL mesh should render.
7. Click `models/box.fbx` — FBX cube preview should appear.
