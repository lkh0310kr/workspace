# 결과 중심 스펙 점검

스펙은 구현 절차보다 사용자가 관찰하는 시작 조건·행위·결과를 먼저 기록한다. 내부 구현은 결과가 달라지는 경계의 계약일 때만 규범으로 고정한다.

## 현재 적용 원칙

- Desktop Editor: 파일을 열고 수정한 뒤 같은 로컬 경로에서 결과를 다시 확인한다.
- 파일시스템 경계: dirty 저장·외부 변경·충돌·rename 뒤에도 수정 내용을 조용히 덮어쓰지 않는다.
- Server: 허용된 identity만 API에 접근하며 provider별 실패를 구분한다.
- UI 수명: stale response가 새 문서나 해제된 view를 덮지 않는다.

## 남은 개선

1. Editor acceptance ID마다 자동 또는 수동 evidence를 연결한다.
2. Desktop과 Server의 runtime 경계별 실패·취소·복구 결과를 기록한다.
3. 사용하지 않는 흐름이 유지보수 부담을 만들면 제품 범위를 기준으로 분리하거나 archive한다.

세부 스펙은 [Editor](../architecture/editor/README.md), [Desktop](../architecture/workspace/README.md), [Server](../architecture/workspace-server/README.md) 문서가 소유한다.
