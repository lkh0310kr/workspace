# 백로그

## 진행 중

### 제품별 앱·서버 경계 재설계 및 Workspace Home 복구

- **문제:** 공용 PKMS Worker가 웹 앱 폴더 아래에 있어 다른 클라이언트가 쓰는 서버가 Web에 종속돼 보인다. Home 대시보드와 그 API도 감축 과정에서 제품 범위 밖으로 잘못 이동됐다.
- **범위:** `pkms-web`, `pkms-server`, `workspace-app`, `workspace-server`, `pkms-ios`를 실행 가능한 앱 단위로 정리한다. Home UI/API/OAuth를 복구하고 PKMS 서버와 별도 인증·비밀·배포 경계로 분리한다. 공유 계약은 `packages/`에 둔다.
- **완료 조건:** Home 대시보드가 다시 동작하고 Cloudflare/Supabase 연결과 상태 API를 제공한다. PKMS 서버는 PKMS 기능만 소유한다. Web·Desktop·iOS는 같은 PKMS 서버 계약을 사용한다. CI, 개발/배포 명령, 문서가 새 경로를 가리키며 각 앱 경계를 독립적으로 검증할 수 있다.
- **설계 기준:** [제품별 앱 경계](../architecture/08-monorepo-module-boundaries.md)

## 다음

- PKMS·Workspace Editor 통합 — [기능 스펙과 provider 계약](./editor-unification.md)
- Home 시스템 정보: Activity Monitor, Storage 확인

