# 코드에서 추출한 스펙의 운영 규칙

스펙은 관찰 가능한 사용자 결과와 앱·package 경계를 설명한다. module source와 문서 추적은 [스펙 인덱스](./spec-index.json)가 담당한다. 현재 인덱스는 11개 모듈, 63개 고유 문서, 536개 source digest를 추적한다. 이 수치는 의미 검토나 재생성 검증 완료 수가 아니다.

## 기본 원칙

- 요구된 시작 조건, 행위, 목표 상태와 관찰 결과를 먼저 정의한다.
- 실패·취소·재시작·복구 후에도 지켜야 하는 결과를 수락 기준으로 둔다.
- wire format, 권한, 저장 내구성과 같이 결과가 달라지는 계약만 구현 상세로 고정한다.
- 소스 링크는 현재 동작의 근거다. 다른 구현 방법을 불필요하게 금지하지 않는다.
- 기존 기능을 바꾸려면 목표 결과와 호환성 영향을 함께 기록한다.

## 활성 모듈 범위

| 영역                           | 문서                                             | 검증 공백                                         |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------- |
| Shared Editor                  | [Editor 기능 문서](./editor/README.md)           | 시각 fixture와 모든 Markdown surface의 acceptance |
| Desktop Editor/provider        | [로컬 provider](./workspace/editor/providers.md) | 실제 UI에서 외부 변경·충돌·저장 확인              |
| Desktop shell/browser/terminal | [Workspace 색인](./workspace/README.md)          | native focus, IME와 OS별 동작                     |
| Server                         | [Server 계약](./server/README.md)                | health endpoint 배포 확인                         |

## 구현과 검증

1. 관련 개발 지침, index, 담당 스펙과 테스트를 읽는다.
2. 목표 결과와 실패 경계를 구현한 뒤 영향을 받는 acceptance를 검증한다.
3. 테스트 결과, 수동 UI 확인, 운영·배포 확인을 서로 다른 evidence로 기록한다.
4. 동작과 스펙을 함께 갱신하고 실제 source를 대조한 뒤 index digest를 갱신한다.

Root에서 `npm run check`는 Desktop typecheck, 공유 Editor tree 계약 검사와 지정 Vitest를 실행한다. `npm run server:typecheck`은 Server typecheck를 실행한다. `node scripts/check-architecture-specs.mjs`는 문서 링크, source 존재와 digest를 검사한다. 이 검사들은 OS UI와 배포 acceptance를 대신하지 않는다.

## Drift 처리

`node scripts/check-architecture-specs.mjs --refresh`는 source digest만 갱신한다. 실제 코드를 문서와 대조한 뒤 실행하고, 바로 이어 `node scripts/check-architecture-specs.mjs`로 링크와 baseline을 확인한다. 새 source는 의미 검토 후 적절한 module에 등록한다.
