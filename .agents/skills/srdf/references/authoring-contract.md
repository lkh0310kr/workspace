# SRDF 작성 계약

SRDF XML을 직접 작성하거나 편집할 때 이 문서를 참고하세요. 기준 파일인 `.srdf` 자체를 감사할 수 있어야 합니다. 계획 의도와 출처를 파일에 기록하며, 연결할 URDF는 정해진 규칙으로 찾습니다.

## 파일 구조

작성하는 모든 `.srdf`는 다음 순서를 따릅니다:

1. XML declaration: `<?xml version="1.0"?>`.
2. Planning-ledger comment block (compact form of `references/planning-ledger.md`).
3. One `<robot>` root with the **same `name` as the paired URDF**: `<robot name="...">`.
4. `<virtual_joint>` elements, then `<group>`, `<group_state>`, `<end_effector>`, `<passive_joint>`, `<disable_collisions>` — grouped by element type, in that order.

들여쓰기는 공백 두 칸을 사용하세요. chain tip을 선택한 이유나 pair를 비활성화한 이유처럼 중요한 결정은 해당 위치에 주석으로 남기세요.

## URDF 연결 (필수)

SRDF는 **같은 폴더에 두고 robot name을 일치시키는 방식**으로만 URDF와 연결됩니다:

- `.srdf`를 설명 대상 `.urdf`와 **같은 폴더**에 저장하세요.
- 두 파일의 `<robot name="...">` 값이 같아야 합니다.
- 해당 폴더에는 그 robot name을 선언하는 `.urdf`가 정확히 하나만 있어야 합니다. validator와 CAD Viewer는 폴더를 검색해 연결 파일을 찾으며 일치하는 URDF가 없거나 여러 개면 오류를 냅니다.
- 기본 파일명(`so101.srdf`와 `so101.urdf`)을 맞추는 방식은 관례이며 가독성을 위해 권장하지만 파일 연결 기준은 robot name입니다. 한 로봇의 여러 SRDF 계획 변형(`so101_dual.srdf`, `so101_precise.srdf`)도 이름을 통해 같은 URDF와 연결됩니다.
- 별도의 link element는 없습니다. SRDF는 같은 폴더에서 robot name이 일치하는 URDF와 연결됩니다.

## 이름은 URDF 표에서 가져오기

모든 `link`, `joint`, `base_link`, `tip_link`, `parent_link` 및 group-state joint 이름은 추출한 URDF 표에서 복사해야 합니다(`references/srdf-workflow.md` 참고). 기억이나 비슷한 로봇을 바탕으로 이름을 입력하지 마세요. 비슷하지만 다른 이름(`wrist_roll`과 `wrist_roll_joint`)은 가장 흔한 SRDF 결함이며 검증에서 거부됩니다.

## Element 계약

- `<group>`: prefer exactly one `<chain base_link tip_link>` for a serial manipulator — base to tip must be a real parent→child path in the URDF tree. Use explicit `<joint>`/`<link>` members for non-chain groups (grippers, heads), and `<group>` subgroups for unions (dual-arm, whole-body). Do not mix representations in one group without reason.
- `<group_state name group>`: one `<joint name value>` per **movable, non-mimic** joint in the group. Radians for revolute/continuous, meters for prismatic, values within URDF limits.
- `<end_effector name parent_link group parent_group>`: the EE group must not share links with `parent_group`; `parent_link` belongs to the parent group (or is adjacent to the EE group) and is typically the attachment/flange link.
- `<virtual_joint name type parent_frame child_link>`: attaches the robot root to an external frame (`world`). `fixed` for fixed-base arms; `planar`/`floating` only when planning genuinely needs that freedom.
- `<passive_joint name>`: unactuated joints that planners must not command.
- `<disable_collisions link1 link2 reason>`: evidence-backed only; see `references/disabled-collisions.md`. No duplicate or reversed-duplicate pairs.

## 기준 골격 예시

```xml
<?xml version="1.0"?>
<!--
  srdf: example_arm | urdf: example_arm.urdf | task: arm IK + gripper control
  groups: arm (chain base_link->tool0), gripper (joint members)
  states: home, ready (radians, within URDF limits)
  disabled collisions: URDF-adjacent pairs only (reason Adjacent)
  assumptions: tool0 is the TCP; no sampled collision matrix yet
-->
<robot name="example_arm">
  <virtual_joint name="world_to_base" type="fixed" parent_frame="world" child_link="base_footprint" />
  <group name="arm">
    <chain base_link="base_link" tip_link="tool0" />
  </group>
  <group name="gripper">
    <joint name="finger_joint" />
  </group>
  <group_state name="home" group="arm">
    <joint name="shoulder_pitch" value="0" />
    <joint name="elbow_pitch" value="0" />
    <joint name="wrist_roll" value="0" />
  </group_state>
  <end_effector name="gripper_eef" parent_link="tool0" group="gripper" parent_group="arm" />
  <disable_collisions link1="base_link" link2="shoulder_link" reason="Adjacent" />
</robot>
```

## 보조 스크립트

인접 pair 목록, 관절이 많은 로봇의 subgroup union, degree-to-radian 표는 계산으로 얻을 수 있습니다. joint가 몇 개를 넘는 로봇이라면 손으로 처리하는 대신 URDF에 짧은 임시 스크립트를 실행해 도출하세요. 스크립트는 보조 수단이며 저장소에 포함된 `.srdf`가 기준입니다.
