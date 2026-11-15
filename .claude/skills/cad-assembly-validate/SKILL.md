---
name: cad-assembly-validate
description: Validate cadgen assembly STEP files — topology, interference, mate deltas, and project-specific layout contracts. Use after building or editing assembly.py, when parts float or clash, or before marking an assembly phase complete.
---

# CAD 어셈블리 검증

벤치 프로젝트에서 얻은 **어셈블리 전용** 검사를 `$cad` 점검에 추가합니다.

## 사용 시점

- After `assembly.py` changes or before closing an assembly phase
- User reports floating parts, wrong belt/cam alignment, or mate drift
- Before URDF / viewer handoff

## 빠른 실행 (workspace)

```bash
npm run agents:cad:assembly-validate -- models/<project>
```

`src/assembly.py`를 다시 빌드한 다음 validate, interfere, layout contract를 실행합니다.

## 수동 실행 순서 (저장소 루트에서)

```bash
npm run agents:python -- models/<project>/src/assembly.py --force
npm run agents:python -- -m cadgen.cli step inspect validate models/<project>/STEP/assembly.step
npm run agents:python -- -m cadgen.cli step inspect interfere models/<project>/STEP/assembly.step --format json
npm run agents:python -- models/<project>/src/lib/assembly_validate.py
```

## 필요한 프로젝트 파일

| 파일 | 용도 |
|------|---------|
| `bench/assembly-contract.md` | Human-readable mate datums and world frames |
| `src/lib/layout.py` | Single source of truth for world positions |
| `src/lib/assembly_validate.py` | Numeric checks (centers, gaps, coaxiality) |

## 파트 작성 규칙 (벤치에서 얻은 교훈)

Read `references/bench-lessons.md`. Summary:

1. **원점에 풋 배치** — 원점을 다시 잡은 뒤 각 파트의 주 장착 기준점은 로컬 프레임의 `(0,0,0)`이어야 합니다.
2. **메이트마다 이동은 한 번만** — 조인트가 두 번 이동시키지 않는다는 확신이 없으면 같은 축에 `coaxial`과 추가 `Pos`를 함께 적용하지 마세요.
3. **월드 좌표 계산은 layout.py에서 담당** — `assembly.py`에 임의의 상수를 넣지 마세요.
4. **필요한 경우 `Pos`를 명시적으로 사용** — `AssemblyHelper`로 배치하기 어려우면 `bd.Pos(layout.world(...)) * part()`를 사용하고 이유를 계약 문서에 기록하세요.
5. **검사 전에 다시 빌드** — `validate`와 `interfere`는 오래된 소스가 아니라 디스크의 STEP 파일을 읽습니다.

## 통과 기준

- `validate`: `ok: true`, zero failures
- `interfere`: no inter-part `clashes` above tolerance (default 1000 mm³)
- `assembly_validate.py`: all contract checks `pass`
- Viewer snapshot: no obvious float (optional; encode recurring findings as new checks)

## 보고 형식

```text
Assembly validation — <project>
- rebuild: OK (<ms>)
- validate: OK (N occurrences)
- interfere: OK / FAIL (list clashes)
- layout contract: OK / FAIL (list deltas)
```

실패가 있으면 어셈블리 메이트보다 **layout.py 또는 파트 기준점부터** 수정하세요.
