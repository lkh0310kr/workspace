# 백로그

## 진행 중

### 제품별 앱·서버 경계 재설계 및 Workspace Home 복구

- **문제:** 공용 PKMS Worker가 웹 앱 폴더 아래에 있어 다른 클라이언트가 쓰는 서버가 Web에 종속돼 보인다. Home 대시보드와 그 API도 감축 과정에서 제품 범위 밖으로 잘못 이동됐다.
- **범위:** `pkms-web`, `pkms-server`, `workspace-app`, `workspace-server`, `pkms-ios`를 실행 가능한 앱 단위로 정리한다. Home UI/API/OAuth를 복구하고 PKMS 서버와 별도 인증·비밀·배포 경계로 분리한다. 공유 계약은 `packages/`에 둔다.
- **완료 조건:** Home 대시보드가 다시 동작하고 Cloudflare/Supabase 연결과 상태 API를 제공한다. PKMS 서버는 PKMS 기능만 소유한다. Web·Desktop·iOS는 같은 PKMS 서버 계약을 사용한다. CI, 개발/배포 명령, 문서가 새 경로를 가리키며 각 앱 경계를 독립적으로 검증할 수 있다.
- **설계 기준:** [제품별 앱 경계](../architecture/08-monorepo-module-boundaries.md)

## 문서·검증 체계 정비

### 제품 전체 스펙 주도 개발 전환

- **문제:** 상위 구조 설명과 현재 구현의 불일치, 기능별 계약 누락, 수락 기준과 실행 검증의 연결 부족으로 문서에서 코드를 재생성할 때 동작을 보존하기 어렵다.
- **범위:** [Top-down 감사](./top-down-documentation-audit.md)의 AUD-01~24와 [SDD 전환 계획](./spec-driven-development-roadmap.md)의 WP-01~12. 모듈 상세는 앱·패키지 소유 문서에 두고 최상단은 연결한다.
- **착수 순서:** 제품/기능 inventory → 현재 기준 충돌 정리 → 계약·영속 상태 지도와 CI/test 경로 → Shell·Terminal·PKMS 등 영역별 스펙 → 독립 단위 재생성 검증.
- **완료 조건:** 기능별 owner·현재 상태·스펙·검증 경로를 찾을 수 있고, 핵심 여정의 정상/실패/경합/복구 계약이 소스와 일치한다. 재생성 검증 여부와 남은 배포/native acceptance를 구분한다.
- **현재 상태:** 감사·기획 완료. 각 WP의 제품 구현·CI 개선·문서 보강은 후속 실행 대상이다.

## 다음

- PKMS·Workspace Editor 통합 — [기능 스펙과 provider 계약](./editor-unification.md)
- Home 시스템 정보: Activity Monitor, Storage 확인

