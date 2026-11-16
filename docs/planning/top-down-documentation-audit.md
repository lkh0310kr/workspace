# 문서 구조 점검

문서는 제품 목표부터 사용자 여정, 앱 경계, package 계약, 검증 근거 순으로 연결한다. 상세 구현 문서는 root `docs/`에 두고 app/package README는 진입 안내와 실행 방법만 제공한다.

## 현재 활성 범위

| 영역 | 기준 문서 | 남은 확인 |
| --- | --- | --- |
| Desktop 로컬 파일·Editor | [Workspace](../architecture/workspace/README.md), [Editor](../architecture/editor/README.md) | 실제 UI 저장·충돌·검색 acceptance |
| Server API | [Workspace Server](../architecture/workspace-server/README.md) | identity 설정·OAuth callback·D1 운영 |
| 전체 시스템 | [개요](../architecture/01-overview.md), [module 경계](../architecture/08-monorepo-module-boundaries.md) | CI 및 package lockfile과의 일치 |

## 점검 원칙

- 활성 문서는 현재 앱·package 구조와 일치해야 한다.
- 운영 설정이나 runtime 동작은 코드 문서만으로 검증 완료 처리하지 않는다.
- 보류한 구현과 이전 조사 기록은 제품 기준 문서와 분리해 보관한다.
- 검증하지 못한 경계는 완료로 표시하지 않고 다음 acceptance를 적는다.
