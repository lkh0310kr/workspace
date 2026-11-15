# SRDF 작업 절차

기존 URDF를 대상으로 MoveIt 계획 의미론을 만들거나 편집할 때 이 문서를 참고하세요.

## 0단계: URDF 표 추출

SRDF XML을 작성하기 전에 수행하세요. 연결된 URDF를 파싱하고(직접 읽거나 로봇이 크면 세 줄짜리 ElementTree script를 실행) 다음을 기록하세요:

- robot `name` (the SRDF must match it exactly);
- every link name;
- every joint: name, type, parent link, child link, lower/upper limits, and whether it has `<mimic>`;
- the root link and the main serial chains (walk parent→child).

SRDF에 등장하는 모든 이름은 **이 표에서 복사해야 합니다**. 원하는 이름이 표에 없다면 URDF 또는 가정이 잘못된 것이므로 먼저 `$urdf`로 해결하세요. 이 습관만으로도 그럴듯하지만 일치하지 않는 이름과 tree에 없는 chain이라는 흔한 SRDF 실패 유형을 예방할 수 있습니다.

## 편집 절차

1. URDF가 유효한지(`$urdf` validator) 확인하고 URDF 표를 추출합니다.
2. planning ledger(`references/planning-ledger.md`)를 읽거나 작성하고 요약본을 `.srdf`의 주석 블록에 보관합니다.
3. `references/authoring-contract.md`에 따라 SRDF XML을 직접 작성하거나 편집합니다. element 순서는 virtual joint, group, group state, end effector, passive joint, disabled collision입니다. 같은 robot name을 가진 URDF 옆에 저장합니다. 모든 consumer는 같은 폴더 및 이름 일치 규칙으로 파일을 연결합니다.
4. disabled collision(`references/disabled-collisions.md`)과 group-state 값(URDF 기본 단위, limit 이내)은 임의로 만들지 말고 근거에서 도출합니다.
5. `cadgen srdf validate <file.srdf>`로 검증하고 finding이 없어질 때까지 수정합니다.
6. 파일을 `$cad-viewer`에 전달하고 실시간 검토 링크를 반환합니다.
7. MoveIt 환경이 있으면 MoveIt smoke test를 실행하고, 없으면 생략했다고 보고합니다.
8. 추론한 TCP link, 수동 collision pair, 확인하지 못한 planner 동작 등 가정을 보고합니다.

## Group 설계

- **Serial manipulator** → one chain group, `base_link` at the mount, `tip_link` at the flange/TCP link. The validator rejects chains that are not a real parent→child path.
- **Gripper / hand** → joint-member group listing its actuated joints; it becomes the end-effector group.
- **Dual-arm / whole-body** → subgroup unions. Check for duplicate semantics (a joint reachable through two subgroups) and cycles.
- **Mobile base** → typically a planar/floating virtual joint plus a group for the base; do not model wheel joints as planning DOF unless the planner consumes them.

Fixed 및 mimic joint는 계획 변수가 아닙니다. group state에 포함하지 말고 chain에서 파생한 group은 이를 자동으로 제외합니다.

## URDF 변경 시

link나 joint 이름 변경, limit 변경 또는 chain 구조 변경은 별도 알림 없이 SRDF를 무효화할 수 있습니다. URDF를 수정한 뒤에는 연결된 `.srdf`에 SRDF validator를 다시 실행하고 group state를 새 limit과 대조하세요. 둘 중 하나를 다루는 모든 작업에서 URDF+SRDF를 한 쌍으로 취급하세요.
