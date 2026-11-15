# SRDF 계획 ledger

SRDF XML을 작성하기 전에 이 ledger를 만들거나 갱신하세요. ledger에 계획 가정을 명시하면 그럴듯하지만 잘못된 MoveIt 구성을 예방할 수 있습니다.

## URDF 의존성

| Field | Value |
|---|---|
| URDF path | |
| SRDF output path | |
| Robot name | |
| URDF validated? | yes/no; tool/check |
| Root link | |
| Active joints | |
| Fixed joints | |
| Mimic joints | |
| Passive joints | |
| Links used for collision checking | |
| Known URDF limitations | |

## 계획 작업

| Field | Value |
|---|---|
| Main task | IK / plan-to-pose / gripper / mobile base / dual arm / other |
| Primary planning group | |
| Expected end-effector or TCP | |
| Required solver or planner | |
| Position-only IK? | yes/no; reason |
| Orientation constraints? | yes/no; representation |

## Virtual joint

| Name | Type | Parent frame | Child link | Required? | Rationale |
|---|---|---|---|---|---|
| | fixed / planar / floating | | | | |

Virtual joint는 외부 frame을 기준으로 한 로봇 root pose를 설명합니다. 계획 설정에 world 연결이 필요한 고정형 manipulator에는 fixed를 사용하고, 로봇 모델에 해당 계획 자유도가 필요한 경우에만 planar/floating을 사용하세요.

## Passive joint

| Joint | URDF type | Reason passive | Affected groups | Notes |
|---|---|---|---|---|
| | | | | |

Passive joint는 구동되지 않습니다. 제어 가능한 계획 변수로 취급하면 안 됩니다.

## Planning group

| Group | Representation | Members | Base link | Tip link | Active joints | Excluded joints | Purpose | Solver expectation |
|---|---|---|---|---|---|---|---|---|
| | joints / links / chain / subgroups | | | | | | | |

직렬 arm에서는 URDF graph에서 base link부터 tip link까지 실제 경로가 있을 때만 chain을 우선하세요. subgroup group은 cycle과 중복 의미론이 없는지 확인하세요.

## End effector

| Name | End-effector group | Parent group | Parent link | Target/TCP link | Overlap checked? | Adjacent? | Notes |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

End-effector group은 일반적으로 parent group과 link를 공유하지 않아야 합니다. target/TCP link가 추론한 group tip과 다르면 명시해야 합니다.

## Group state

| State | Group | Joint values | Unit check | Limit check | Purpose |
|---|---|---|---|---|---|
| | | revolute/continuous rad; prismatic m | | | |

SRDF group state에 degree를 저장하지 마세요. group state에서 fixed 또는 mimic joint를 설정하지 마세요.

## Disabled collision

| Link 1 | Link 2 | Reason | Source | Evidence | Risk note |
|---|---|---|---|---|---|
| | | Adjacent / Never / Always / Default / Manual | Setup Assistant / sampled / adjacency / user | | |

시각적 인상으로 disabled collision을 추론하지 마세요. 각 pair에는 사유와 출처가 필요합니다.

## MoveIt smoke test

| Test | Group | Target link | Target pose/state | Expected result | Actual result | Notes |
|---|---|---|---|---|---|---|
| IK solve | | | | | | |
| Plan-to-pose | | | | | | |
| Named state | | | | | | |
| Collision check | | | | | | |

## 보고할 가정

추측하거나 추론한 값을 모두 나열하세요:

- planning group membership;
- chain base/tip;
- target/TCP link;
- virtual joint attachment;
- passive joint classification;
- group-state value;
- disabled collision pair;
- solver or planner setting;
- orientation/position-only IK assumption;
- skipped MoveIt validation.
