# 백로그

## 진행 중

### Workspace Home 운영 연결과 제품 acceptance

- **문제:** 앱·서버 디렉터리 분리와 Home source 복구는 구현됐지만 provider 운영 연결과 제품 acceptance가 남아 있다.
- **범위:** 기존 앱 경계를 유지하며 Home OAuth client secrets/callback을 설정하고 provider를 재연결한다. Web/Desktop/native acceptance와 source/배포 상태 기록을 맞춘다.
- **완료 조건:** Home 대시보드가 다시 동작하고 Cloudflare/Supabase 연결과 상태 API를 제공한다. PKMS 서버는 PKMS 기능만 소유한다. Web·Desktop·iOS는 같은 PKMS 서버 계약을 사용한다. CI, 개발/배포 명령, 문서가 새 경로를 가리키며 각 앱 경계를 독립적으로 검증할 수 있다.
- **설계 기준:** [제품별 앱 경계](../architecture/08-monorepo-module-boundaries.md)

## 문서·검증 체계 정비

### 제품 전체 스펙 주도 개발 전환

- **문제:** 상위 구조 설명과 현재 구현의 불일치, 기능별 계약 누락, 수락 기준과 실행 검증의 연결 부족으로 문서에서 코드를 재생성할 때 동작을 보존하기 어렵다.
- **범위:** [Top-down 감사](./top-down-documentation-audit.md)의 AUD-01~24와 [SDD 전환 계획](./spec-driven-development-roadmap.md)의 WP-01~12. 모듈 상세는 앱·패키지 소유 문서에 두고 최상단은 연결한다.
- **착수 순서:** 제품/기능 inventory → 현재 기준 충돌 정리 → 계약·영속 상태 지도와 CI/test 경로 → Shell·Terminal·PKMS 등 영역별 스펙 → 독립 단위 재생성 검증.
- **완료 조건:** 기능별 owner·현재 상태·스펙·검증 경로를 찾을 수 있고, 핵심 여정의 정상/실패/경합/복구 계약이 소스와 일치한다. 재생성 검증 여부와 남은 배포/native acceptance를 구분한다.
- **현재 상태:** 감사·기획 및 global/app/package 초기 문서화를 커밋했다. [진행 표](./spec-driven-development-roadmap.md)의 partial 범위와 CI·상세 fixture·native acceptance가 남아 있다.

## 다음

- PKMS·Workspace Editor 제품 acceptance와 호환 UI 정리 — [구현 상태·잔여 수락](./editor-unification.md)
- Home 상세 시스템 정보: 프로세스별 Activity Monitor·상세 Storage. 기존 CPU/메모리/홈 volume summary와 범위를 구분

