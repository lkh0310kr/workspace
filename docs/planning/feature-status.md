# 기능·검증 상태

구현 여부와 실제 사용자 환경에서의 확인은 별도로 기록한다. 타입 검사나 단위 테스트만으로 UI acceptance 또는 배포 상태를 완료 처리하지 않는다.

| 영역 | 구현 상태 | 남은 확인 | 기준 |
| --- | --- | --- | --- |
| Desktop 로컬 Editor | 구현 | 폴더 내 저장, 외부 변경, 충돌 처리의 실제 UI 동작 | [Editor 문서](../architecture/editor/README.md) |
| Home·Browser·Terminal | 기능 패키지와 Desktop host로 구성 | 각 기능의 기존 동작과 lifecycle을 실제 사용 흐름에서 확인 | [Desktop 기능 문서](../architecture/workspace/README.md) |
| 기능 패키지 경계 | Home·Browser·Terminal·Editor·UI 패키지 존재 | host 의존성, 공개 API, 기존 pane 동작이 문서와 일치하는지 확인 | [패키지 경계](../architecture/08-monorepo-module-boundaries.md) |
| Home 시스템 요약 | 구현 | 지원 OS에서 CPU·저장 공간 표시값 확인 | [Home 문서](../architecture/workspace/home/README.md) |
| Server health | `GET /api/health` 구현 | 배포된 Worker 응답과 배포 workflow 확인 | [Server 문서](../architecture/server/README.md) |
| Editor 검색·Markdown | 구현 | Quick Open, 파일 내용 검색, 문서 전환, 주요 Markdown 결과 acceptance | [Editor 스펙](../architecture/editor/README.md) |

제품의 현재 범위는 [집중 범위 문서](../product/platform-focus.md), 착수할 검증 작업은 [백로그](./backlog.md)를 따른다.
