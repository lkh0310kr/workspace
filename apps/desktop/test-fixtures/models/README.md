# 3D model 테스트 fixture

앱 내 model viewer와 import pipeline을 시험하기 위한 샘플 asset이다.

| File                               | Format       | 출처 / license                                                                  |
| ---------------------------------- | ------------ | ------------------------------------------------------------------------------- |
| `box.glb`                          | GLB          | Khronos glTF Sample Assets "Box" (CC0), retained as a generic 3D viewer fixture |
| `duck.glb`                         | GLB          | Khronos glTF Sample Assets "Duck" (CC0) — fetched by script                     |
| `gltf-box/Box.gltf` + `Box0.bin`   | GLTF package | Khronos "Box" glTF with external `.bin` (CC0)                                   |
| `gltf-draco/Box.gltf` + `Box0.bin` | Draco glTF   | Khronos "Box" Draco variant (CC0)                                               |
| `cube.obj` + `cube.mtl`            | OBJ package  | Generated minimal cube with MTL (repo)                                          |
| `cube.stl`                         | STL          | Generated minimal cube (repo)                                                   |
| `box.fbx`                          | FBX          | three.js `vCube.fbx` example (CC0)                                              |

## 갱신

```bash
npm run models:fixtures
```

원격 다운로드에는 network가 필요하다. 첫 실행 뒤에는 `box.glb`, `cube.obj`, `cube.mtl`, `cube.stl`을 offline 상태에서 사용할 수 있다.

## 수동 QA

1. `apps/desktop/test-fixtures/`를 root로 하는 workspace를 연다.
2. TreeView에서 `models/box.glb` 또는 `models/duck.glb`를 누르면 orbit viewer가 표시되어야 한다.
3. `models/gltf-box/Box.gltf`를 누르면 외부 `.bin`을 사용하는 texture 적용 상자가 로드되어야 한다.
4. `models/gltf-draco/Box.gltf`를 누르면 Draco 압축 상자가 로드되어야 한다. decoder WASM을 처음 불러올 때 network가 필요하다.
5. `models/cube.obj`를 누르면 MTL 색상을 적용한 상자가 렌더링되어야 한다.
6. `models/cube.stl`을 누르면 STL mesh가 렌더링되어야 한다.
7. `models/box.fbx`를 누르면 FBX 상자 preview가 표시되어야 한다.
