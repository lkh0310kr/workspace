# 기능·검증 상태

| 영역 | 상태 | 남은 확인 | 기준 |
| --- | --- | --- | --- |
| Desktop 로컬 Editor | 구현 | 선택 폴더에서 파일 저장·외부 변경·충돌을 실제 UI에서 확인 | [Editor 문서](../architecture/editor/README.md) |
| Workspace shell | 구현 | 기존 layout에서 제거된 pane kind가 안전하게 복구되는지 테스트 | [layout 문서](../architecture/workspace/layout/README.md) |
| 기기 정보 Home | 구현 | OS별 CPU·저장 공간 측정값 확인 | [Home 문서](../architecture/workspace/home/README.md) |
| Workspace Server API | 구현 | 배포 identity 설정, OAuth callback과 D1 운영 검증 | [Server 문서](../architecture/workspace-server/README.md) |
| 공유 Editor | 구현 | 주요 Markdown·tree acceptance와 공개 export 확인 | [Editor 스펙](../architecture/editor/README.md) |

기능 구현, 자동 검사, 실제 UI acceptance와 운영 설정은 별도 상태로 기록한다. 소스 코드나 타입 검사만으로 운영 준비가 완료됐다고 판단하지 않는다.
