# SRDF 검증 및 확인

작업 완료를 보고하기 전에 새로 만들거나 수정한 모든 `.srdf`에 이 절차를 적용하세요.

## 절차

1. **포함된 validator**(항상): `cadgen srdf validate path/to/robot.srdf`. 한 번에 모든 finding(severity, code, XML path)을 수집합니다. 모두 수정하고 깨끗해질 때까지 다시 실행하세요. warning도 실패로 처리하려면 `--strict`, 기계가 읽을 수 있는 출력을 원하면 `--json`을 사용하세요.
2. **Viewer 검토**(`$cad-viewer`를 사용할 수 있는 경우): SRDF를 불러오고 연결된 URDF가 확인되어 렌더링되는지 검증한 다음 명명된 group state를 실행해 보세요.
3. **MoveIt smoke test**(MoveIt 환경을 사용할 수 있는 경우): MoveIt Setup Assistant 또는 프로젝트 launch에서 URDF+SRDF 쌍을 불러오고 primary group의 IK를 계산한 뒤 명명된 state로 계획하세요. 사용할 수 없으면 생략했다고 보고하세요.

## 포함된 validator의 검사 항목

구조 및 연결:

- root is `<robot>` with a non-empty name;
- a paired URDF resolves: exactly one `.urdf` in the same folder declares the SRDF's robot name (`no_paired_urdf` / `ambiguous_paired_urdf` errors otherwise); a leftover `<tcad:urdf>`/`<explorer:urdf>` element warns as deprecated and is ignored;
- unique group, end-effector, group-state, and collision-pair identities.

연결된 URDF와 대조:

- every group joint/link/subgroup name exists (joints in the URDF, links in the URDF, subgroups in the SRDF);
- every chain `base_link`/`tip_link` exists **and** the chain is a real parent→child path in the URDF tree;
- subgroup references contain no cycles;
- at least one planning group is defined;
- virtual joints: valid type (`fixed`/`floating`/`planar`), non-empty `parent_frame`, `child_link` exists in the URDF (name collisions with URDF joints warn);
- passive joints exist in the URDF and are never set by group states;
- end effectors: group exists, parent group exists when named, parent link exists, no link overlap between EE group and parent group, parent link in parent group or adjacent to the EE group;
- group states: group exists, each joint exists and belongs to the group, no fixed/mimic/passive joints, values within URDF revolute/prismatic limits; states that omit group joints warn (MoveIt fills them from the current state);
- disabled collisions: both links exist, distinct, non-empty reason, no (reversed) duplicates; pairs claiming reason `Adjacent` that are not actually joined by a URDF joint warn; warns when 25+ pairs are manually reasoned;
- unknown elements under `<robot>` or `<group>` warn — misspelled elements are otherwise silently ignored by MoveIt;
- a paired URDF that is not a single-rooted tree warns (chain/adjacency checks become unreliable).

## 검증으로 입증할 수 없는 사항

- That the planning group matches the user's task intent (right arm vs left arm).
- That the TCP/target link is the physically correct tool point.
- That disabled pairs are safe at every reachable configuration — only sampling (Setup Assistant) approaches that.
- That group-state poses are collision-free or useful.

이는 의미론적 결정입니다. ledger에 기록하고 확신이 필요한 경우 viewer 또는 MoveIt에서 직접 확인하세요. 시각적 렌더링 검토만으로 계획의 정확성을 입증할 수는 없습니다.

## 실패 처리

URDF 대조 검증이 실패하면 편집하기 전에 어느 쪽이 잘못됐는지 판단하세요. 이름 누락은 SRDF의 오타일 수도 있고 기존 의미론을 무효화한 URDF 이름 변경일 수도 있습니다. 담당 파일을 수정하고(구조는 `$urdf`) 쌍에 validator를 다시 실행하세요.
