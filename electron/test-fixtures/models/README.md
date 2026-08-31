# 3D model test fixtures

Sample assets for the in-app model viewer and import pipeline tests.

| File | Format | Source / license |
|------|--------|------------------|
| `box.glb` | GLB | Khronos glTF Sample Assets "Box" (CC0), copied from `world-engine-mesh-demo/` |
| `duck.glb` | GLB | Khronos glTF Sample Assets "Duck" (CC0) — fetched by script |
| `cube.obj` | OBJ | Generated minimal cube (repo) |
| `cube.stl` | STL | Generated minimal cube (repo) |
| `box.fbx` | FBX | Minimal binary header fixture for format sniffer / stub importer tests |

## Refresh

```bash
npm run models:fixtures
```

Remote downloads require network. `box.glb`, `cube.obj`, and `cube.stl` work offline after the first run.

## Manual QA

1. Open a workspace rooted at `electron/test-fixtures/`.
2. Click `models/box.glb` or `models/duck.glb` in TreeView — orbit viewer should appear.
3. Click `models/box.fbx` or `models/cube.obj` — unsupported conversion message (no crash).
