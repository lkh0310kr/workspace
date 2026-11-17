# 스펙 기반 개발 로드맵

현재 스펙은 구현된 Desktop, 공유 Editor, Server의 소유 경계와 사용자 결과를 기준으로 관리한다.

## 작업 순서

| 단계 | 작업 | 완료 조건 |
| --- | --- | --- |
| 1 | Desktop·Server·package 경계와 문서 index 정리 | 활성 모듈과 source links가 현재 저장소 구조를 가리킨다. |
| 2 | Editor와 파일 탐색 acceptance 정리 | 저장·외부 변경·검색·rename 결과에 테스트나 수동 evidence가 연결된다. |
| 3 | Terminal·Browser lifecycle 스펙 보완 | focus·재시작·취소·복구 결과를 각 owner 문서가 설명한다. |
| 4 | Server health endpoint 확인 | 배포된 Server가 상태 확인 요청에 응답하는지 검증한다. |
| 5 | CI 영향 경로와 검증 명령 유지 | 변경된 module에 필요한 검사만 실행하고 실패 exit를 전달한다. |

## 문서 소유

- 제품 목표와 성공 기준은 [프로젝트 정의](../product/프로젝트%20정의.md)가 소유한다.
- Desktop 구현 계약은 `docs/architecture/workspace/` 아래에 둔다.
- 공유 Editor 계약은 `docs/architecture/editor/` 아래에 둔다.
- Server 계약은 [Server 문서](../architecture/server/README.md)가 소유한다.
- Source traceability는 [spec-index](../architecture/spec-index.json)가 소유한다.

## 완료 판정

스펙과 코드는 같은 계약을 설명하고, 검증 결과는 자동 테스트·수동 UI 확인·운영 설정으로 구분한다. 파일 존재나 digest 일치만으로 의미 검증이나 실제 배포 acceptance를 완료했다고 판단하지 않는다.
