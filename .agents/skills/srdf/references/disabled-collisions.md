# SRDF disabled collision

Disabled collision은 계획 안전성 데이터입니다. 장식용 XML이 아니라 근거에서 도출된 정보로 다루세요.

## 유효한 근거

다음 근거 중 하나를 사용하세요:

- adjacent-link policy from the URDF kinematic graph;
- MoveIt Setup Assistant self-collision matrix generation;
- sampled collision analysis from a known MoveIt configuration;
- explicit user-provided collision matrix;
- a manually reviewed pair with a specific rationale.

시각적 테마나 모호한 설명을 근거로 disabled collision pair를 추론하지 마세요.

## XML 형식

```xml
<disable_collisions link1="base_link" link2="shoulder_link" reason="Adjacent"/>
```

현재 runtime은 다음을 요구합니다:

- `link1` and `link2`;
- both links to exist in the URDF;
- distinct link names;
- a non-empty `reason`;
- no duplicate or reversed duplicate pairs.

## 사유와 출처

사실에 부합하는 사유를 사용하세요. 예시:

| Reason | Typical source |
|---|---|
| `Adjacent` | URDF graph adjacency |
| `Never` | Setup Assistant sampled matrix |
| `Always` | Setup Assistant sampled matrix |
| `Default` | Setup Assistant sampled matrix |
| `Manual: tool fixture is outside workspace envelope` | Explicit human review |

현재 parser는 사유를 adjacent, sampled, setup assistant, manual, assumed 등의 넓은 출처 범주로 분류합니다. 사용자가 임시 SRDF를 명시적으로 요청하고 위험을 보고하는 경우가 아니라면 `assumed`를 피하세요.

## 검토 목록

disabled collision pair를 commit하기 전에 확인하세요:

- Is the pair adjacent or sampled-safe?
- Does disabling the pair hide a possible real collision during the planned task?
- Was the pair generated with sufficient sampling density?
- Is the pair still valid after geometry, limits, or group membership changed?
- Was manual rationale written down?

수동 pair가 많다면 MoveIt Setup Assistant로 self-collision matrix를 다시 생성하는 편이 좋습니다.
