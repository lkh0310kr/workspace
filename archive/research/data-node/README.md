# Android Data Node 아카이브 자료

작성일: 2026-11-16
상태: 취소됨·아카이브됨

Android Data Node의 취소 시점 자료와 프로토타입을 보존한다. 이 문서는 아카이브의 내용 색인이며 현재 제품 요구사항이나 작업 계획이 아니다.

## 보존한 자료

### 연구 문서

이 디렉터리에는 기존 `docs/research/data-node/`에서 이동한 추적 연구 문서 7개가 있다.

- `CANCELLATION.md`: 취소 결정, 확인된 구현·기기 검증, 미완료 항목과 마지막 기기 상태
- `PKMS_Data_Node_Full_Context.md`: 전체 프로젝트 맥락과 조사 인수인계
- `android-data-node-design.md`: 목표 아키텍처와 프로토타입 구현 범위
- `feasibility-and-research-2026-11.md`: Android 상시 실행·저장소·복구 현실성 조사
- `github-repository-as-data-node.md`: GitHub 저장소를 DB/Object Storage로 쓰는 방안 평가
- `pkms-server-github-storage-architecture.md`: 당시 PKMS 서버 저장 흐름과 대안 분석
- `storage-abstraction-feasibility.md`: Supabase와 Android 저장소 추상화 가능성 분석

### 프로토타입 소스

`apps/android-data-node/`의 추적 파일 15개를 [보존된 Android 프로젝트](../../apps/android-data-node/)로 이동했다. Gradle 설정과 wrapper, Android manifest, Kotlin 저장소·provider·activity 소스, one-click 검증 스크립트와 프로젝트 README를 포함한다. 이는 production backend가 아닌 로컬 검증용 prototype이며 취소 기록에 적힌 범위만 보존한다.

### 로컬 생성물

`.gradle/`, `app/build/`, `.artifacts/`의 로컬 캐시·빌드 결과·기기 로그도 기존 프로젝트 경로를 비우기 위해 아카이브 프로젝트 안으로 이동했다. 모두 `.gitignore` 대상이며 커밋되지 않았다. 이 생성물은 아카이브 검토나 재현 검증의 근거로 취급하지 않는다.

## 범위와 재개

이 문서는 과거 자료의 보존 위치를 안내하며 prototype의 운영 가능성이나 재현 검증을 새로 주장하지 않는다.
