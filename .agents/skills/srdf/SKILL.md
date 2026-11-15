---
name: srdf
description: MoveIt2 SRDF 작성, 검증 및 계획 의미론 워크플로. `.srdf` 파일, MoveIt planning group, virtual joint, passive joint, end effector, group state, disabled collision, URDF와 연결된 계획 의미론을 만들거나 편집·검사·검증하고 SRDF를 실시간 검토에 전달할 때 사용합니다. 로봇 구조에는 URDF skill을, 시뮬레이터 설명에는 SDF skill을, 렌더링과 실시간 검토 링크에는 cad-viewer skill을 사용합니다.
---

# SRDF

출처: [earthtojake/text-to-cad](https://github.com/earthtojake/text-to-cad)에서 관리됩니다.
실행 시 기준은 설치된 로컬 skill 파일입니다. 저장소 링크는 출처 및 릴리스 검토용입니다.

유효한 URDF를 바탕으로 MoveIt 의미론적 로봇 설명을 작성할 때 이 skill을 사용합니다. SRDF는 계획 의미론을 정의하며 물리적 로봇 구조는 정의하지 않습니다. 기준 파일은 `.srdf`입니다. XML을 직접 작성하고 편집하세요. `gen_srdf()` 계약은 없습니다.

SRDF의 정확성은 **계획 의미론**의 문제입니다. 흔한 실패는 XML 오류가 아니라 MoveIt에 잘못된 planning group, tool link, 기본 상태, 안전하지 않은 disabled-collision matrix 또는 joint 단위를 지정하는 그럴듯한 SRDF입니다. 언어 모델은 공간 및 기구학적 추론이 취약하므로 planning group, end effector, group state 및 disabled collision은 URDF 토폴로지, MoveIt Setup Assistant 출력, 샘플링한 충돌 분석 또는 사용자가 명시한 데이터에서 도출하세요. 시각적 테마만으로 추론하지 말고 link나 joint 이름을 기억에 의존해 입력하지 마세요. 먼저 URDF의 link/joint 표를 추출한 다음 거기서 이름을 복사하세요.

## Setup

이 skill의 명령은 Python 빌드 런타임과 실행할 JavaScript를 포함하는 `cadgen` 배포판의 얇은 진입점입니다.
한 번 설치하세요:

```bash
python -m pip install -r requirements.txt
```

렌더링에는 브라우저도 필요하며 pip로 설치할 수 없습니다:

```bash
python -m playwright install chromium
```

## 포맷 경계

- **URDF**는 link, joint, geometry, inertial, limit, mimic joint, transmission, robot-state publishing 등 물리적 로봇 구조를 담당합니다.
- **SRDF**는 virtual joint, passive joint, planning group, group state, end effector, disabled collision pair 등 MoveIt 의미론을 담당합니다.
- **SDF**는 physics, sensor, light, plugin, world 및 시뮬레이션 전용 metadata 등 시뮬레이터/월드 의미론을 담당합니다.

SRDF에 geometry, inertial, joint origin, link pose, mesh reference, 물리 joint limit, transmission 또는 `ros2_control` interface를 넣지 마세요.

## CAD Viewer Handoff

`.srdf`를 만들거나 수정하는 SRDF 작업을 마치면 해당 skill이 설치된 경우 명시적인 파일 경로를 반드시 `$cad-viewer`에 전달해야 합니다. `$cad-viewer`는 CAD Viewer가 실행 중이 아니면 시작하고 해당 파일의 링크를 반환해야 합니다. `$cad-viewer`를 사용할 수 없거나 시작에 실패하면 전달을 조용히 생략하지 말고 그 사실을 보고하세요.

## Required workflow

1. **유효한 URDF에서 시작합니다.** 먼저 `$urdf`로 URDF를 작성하거나 수정하고 검증하세요. SRDF는 같은 폴더에 있고 robot name이 일치하는 URDF와 연결되며, SRDF의 모든 이름은 URDF에 있어야 합니다.
2. **URDF 표를 추출합니다.** SRDF XML을 쓰기 전에 URDF의 robot name, link, joint(유형, parent, child, limit, mimic 여부)를 나열하세요. 이름은 이 표에서만 복사하고 기억에 의존해 입력하지 마세요. `references/srdf-workflow.md`를 참고하세요.
3. **계획 작업을 식별합니다.** 목표가 arm IK, gripper 제어, mobile base 계획, dual-arm 계획, tool 사용 또는 로컬 smoke test인지 기록하세요.
4. **planning ledger를 작성하거나 갱신합니다.** XML을 작성하기 전에 `references/planning-ledger.md`를 사용하고 요약본을 `.srdf`의 주석 블록으로 보관하세요.
5. **같은 폴더의 URDF와 연결합니다.** `.srdf`를 같은 `<robot name>`을 가진 `.urdf`와 같은 폴더에 저장하세요. 이것이 유일한 연결 방식입니다. validator와 viewer는 폴더를 검색해 이름이 일치하는 URDF를 찾으며 폴더마다 robot name당 URDF가 정확히 하나여야 합니다. 파일을 연결하는 metadata element는 없습니다. `references/authoring-contract.md`를 참고하세요.
6. **virtual joint와 passive joint를 의도적으로 정의합니다.** 로봇 모델에 필요한 경우 사용하세요.
7. **URDF 토폴로지에 따라 planning group을 정의합니다.** 직렬 manipulator의 base/tip이 URDF tree에서 실제 parent-to-child 경로를 이룰 때 chain group을 우선하세요(validator가 이를 확인합니다). joint/link/subgroup 정의는 의도적으로 필요한 경우에만 사용하세요.
8. **group 구성원을 파악한 뒤 end effector를 정의합니다.** end-effector group과 parent group이 겹치지 않게 하세요. 실제 target/TCP link를 기록하세요.
9. **URDF 기본 단위로 group state를 정의합니다.** Revolute 및 continuous 값은 radian, prismatic 값은 meter입니다. SRDF에 degree를 저장하지 마세요. 값은 URDF limit 이내여야 하며 fixed 또는 mimic joint를 설정하면 안 됩니다.
10. **근거를 바탕으로 disabled collision을 생성합니다.** URDF joint 표에서 도출한 인접 관계, MoveIt Setup Assistant 샘플링 또는 사용자가 명시한 collision matrix를 사용하세요. 광범위한 disable 목록을 임의로 만들지 마세요. `references/disabled-collisions.md`를 참고하세요.
11. 생성하거나 수정한 모든 `.srdf`를 `cadgen srdf validate`로 검증하세요. 연결된 URDF를 기준으로 이름, chain, state 및 pair를 교차 검증합니다. 모든 finding을 수정하고 깨끗한 결과가 나올 때까지 다시 검증하세요.
12. **가능한 경우 MoveIt smoke test를 실행합니다.** MoveIt Setup Assistant 또는 프로젝트의 MoveIt launch를 직접 사용하세요.
13. **가정과 생략한 검사를 보고합니다.** 미완료 검증, MoveIt 환경 부재, 수동으로 판단한 collision disable 및 추론한 target link를 포함하세요.

## Commands

프로젝트 또는 workspace의 Python 환경에서 실행하세요. 예시의 `python`은 interpreter placeholder입니다. `python` 명령을 사용할 수 없으면 `python3`, 프로젝트 virtualenv interpreter 또는 설정된 interpreter 경로로 대체하세요. validator는 Python standard library만 사용합니다.

validator 명령 형식은 다음과 같습니다:

```bash
cadgen srdf validate path/to/robot.srdf
cadgen srdf validate path/to/robot.srdf --strict
cadgen srdf validate path/to/robot.srdf --json
```

validator는 한 번에 모든 finding(severity, code, XML path)을 수집합니다. SRDF를 파싱하고 연결된 URDF(robot name이 일치하는 같은 폴더의 `.urdf`; 없거나 여러 개면 오류)를 찾은 뒤 group/joint/link/subgroup 이름 존재 여부, chain 경로 확인, subgroup cycle, virtual/passive joint, end-effector 토폴로지, group-state 구성원·limit·완전성, disabled-collision pair(`Adjacent` 사유의 진실성 포함), 오타 난 element를 교차 검증합니다. 한 번에 파일 하나를 검증합니다. `--strict`는 warning을 실패로 처리하고 `--json`은 기계가 읽을 수 있는 finding 문서를 출력합니다. 대상 검증이 실패하면 0이 아닌 코드를 반환합니다. 상대 경로 대상은 현재 작업 디렉터리를 기준으로 해석합니다.

## Hard rules

- The SRDF lives in the same folder as its URDF and shares its `<robot name>`; that colocation-plus-name match is the only pairing mechanism, and exactly one URDF per robot name may exist in the folder.
- Every link, joint, group, and subgroup name must come from the URDF table or a group defined in the same file.
- Group states use URDF-native units: radians for revolute/continuous, meters for prismatic.
- Disabled collision pairs require truthful reasons and provenance.
- End-effector groups should not share links with their parent planning group.
- Visual rendering review is useful but cannot prove planning correctness.

## Snapshot Tool

`cadgen snapshot` renders the robot to a PNG still, using the same shared
CLI and headless browser runtime every rendering skill uses — so a snapshot matches what
the CAD Viewer shows.

```bash
cadgen snapshot path/to/robot.srdf review.png
```

Hand it the `.srdf`; it routes by suffix and renders the paired URDF's geometry. Pose the robot with `--joint-values` — `{joint: degrees}` JSON,
joints you do not name staying at the rest pose (the `"jointValues"` job field is the same
thing in a packet). Robots are authored in metres and are framed on the robot scene scale
automatically.

Theme settings live under one `--theme`, mirroring the viewer's Theme tab. The default
theme is `snapshot` — Workbench Light with the ground grid, origin axis and shadows
removed, because in a still image those read as geometry. Leave `--display` off: display
settings (mode, clip, exploded, edges) are CAD topology settings, and a robot carries none.

Link meshes are resolved relative to the description, so they must be present: an
unhydrated Git LFS pointer fails as "No link mesh loaded for robot". Run
`git lfs checkout <mesh dir>` first.

An SRDF's geometry comes from the URDF beside it, so it has no snapshot door of its
own; the polymorphic `cadgen snapshot` routes one by suffix. The grammar is
`cadgen snapshot TARGET [OUT] [flags]`, the same one every format door uses. Use
`cadgen snapshot --help` for the complete current interface.

## References

- Authoring contract (structure, URDF pairing, golden skeleton): `references/authoring-contract.md`
- SRDF workflow (URDF table extraction, edit loop): `references/srdf-workflow.md`
- Planning ledger: `references/planning-ledger.md`
- Validation and verification recipe: `references/validation.md`
- End effectors: `references/end-effectors.md`
- Disabled collisions: `references/disabled-collisions.md`

