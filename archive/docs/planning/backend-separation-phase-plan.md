# Backend 책임 분리 계획

## 문제와 목표

현재 `apps/web`의 Cloudflare Worker가 PKMS 서비스 백엔드이자 Workspace Home의 서비스 상태 백엔드다. `workers/serviceIntegrations.ts`는 Cloudflare·Supabase OAuth 자격 증명, 공급자 API 조회, 서비스 상태 API를 PKMS Worker에 넣고 있다. 그래서 제품 경계와 배포 경계가 맞지 않고, Workspace 백엔드를 PKMS 배포물에 의존시킨다.

`packages/pkms-client`는 백엔드가 아니라 Web과 Desktop이 공유하는 React 클라이언트다. PKMS Worker는 PKMS 계정, 저장소/문서, 협업, GitHub 백업, MCP만 소유하도록 한다. Workspace Home의 서비스 상태 대시보드 API와 공급자 OAuth는 독립 배포 가능한 Workspace Home 서비스로 옮긴다.

## 목표 경계

| 서비스 | 소유 책임 |
|---|---|
| PKMS Cloud (`apps/web`) | PKMS 로그인·세션, GitHub 저장소와 문서, Supabase 협업, 첨부 파일, MCP, GitHub 백업 |
| Workspace Home Service (`apps/workspace-home`) | Cloudflare·Supabase 계정 연결, 공급자 토큰 보관·갱신·해지, 서비스 상태 및 사용량 조회. 전용 Cloudflare D1 사용 |
| Workspace Desktop | Home 운영 대시보드 UI와 서비스 API 호출 어댑터 |
| `packages/pkms-client` | PKMS Web/Desktop 공유 클라이언트 UI와 클라이언트 도메인 로직 |

Home 서비스는 PKMS `SESSION_SECRET`을 공유하지 않는다. PKMS Worker는 인증된 세션으로 `POST /api/home/access-token` 요청을 받아 Home 전용 audience의 5분 JWT를 발급한다. JWT에는 `iss`, Home Worker `aud`, PKMS 사용자 `sub`, `exp`를 넣고 별도 ES256 키로 서명한다. Home Worker는 고정된 PKMS 공개키와 issuer·audience·만료를 검증한다. 공급자 자격 증명과 일회용 OAuth state는 Home 전용 D1에 저장하고, 별도 `HOME_DATA_ENCRYPTION_KEY`로 암호화한다. PKMS account-value 레코드에 Home 연결 정보를 저장하지 않는다.

Home에는 서비스 상태 UI만 남긴다. 날씨·경제·시계·알림 위젯은 운영 대시보드의 목적과 무관해 제거했으며, 이번 백엔드 분리에 다시 포함하지 않는다. `DashboardView`와 `ServiceStatusWidget`은 Desktop UI로 남는다.

## 이전 단계

1. **계약과 인증 경계** — Home 요청/응답 타입을 `packages/workspace-home-protocol`에 둔다. PKMS Worker에 `POST /api/home/access-token`을 추가하고, Home Worker는 전용 ES256 공개키로 issuer·audience·만료를 검증한다. 기존 PKMS API 세션 계약은 바꾸지 않는다.
2. **독립 Home Worker** — `apps/workspace-home`에 Worker, D1 binding/migration, 별도 서명 공개키와 `HOME_DATA_ENCRYPTION_KEY`를 둔다. OAuth 시작/콜백, 연결 상태, 연결 해제, Supabase 관리 지표 token 입력, 계정 현황 조회를 이 서비스로 옮긴다. 공급자 token은 Desktop renderer에 반환하지 않는다.
3. **Desktop 전환과 재연결** — `ServiceStatusWidget`을 새 서비스 base URL과 Home access token을 쓰도록 전환한다. 기존 Cloudflare/Supabase 연결은 Home에서 다시 연결하고, Supabase 관리 지표 token은 다시 입력한다. 구 PKMS 연결 정보는 새 연결이 확인된 뒤 삭제한다.
4. **PKMS에서 제거** — Desktop이 새 API만 사용하는 것을 확인한 뒤 PKMS Worker의 `/api/services/*` 경로, OAuth callback, `serviceIntegrations.ts` 의존 환경변수를 제거한다. 두 Worker는 독립적으로 typecheck/build/deploy 할 수 있게 CI와 배포 문서를 분리한다.

각 단계는 기존 PKMS API·Realtime 계약과 Home UI 동작을 유지하는 작은 변경으로 진행한다. 새 Worker 전환 중에는 기존 `/api/services/*` 경로를 호환 경로로 유지하고, 전환 완료 뒤 제거한다.

## 완료 기준

- PKMS Worker가 Workspace Home 공급자 OAuth/API 코드를 import하지 않고, PKMS 기능만으로 독립 배포된다.
- Workspace Home API가 별도 Worker·D1·암호화 키로 배포되며 PKMS 세션 비밀을 공유하지 않는다.
- Workspace Desktop Home 대시보드가 새 API에서 Cloudflare/Supabase 연결, 상태, 지표를 제공하고 오류·미연결 상태를 구분한다.
- 기존 공급자 연결이 새 Worker에서 다시 승인되고 지표 token이 다시 입력된다. 새 연결 확인 뒤에만 기존 PKMS 저장 값을 제거한다.
- `packages/pkms-client`는 계속 PKMS 클라이언트이며 Workspace Home 백엔드의 이름이나 의존성이 되지 않는다.

## 범위 밖

- 날씨·경제·시계·알림 위젯 복구
- Home UI 재설계
- PKMS 데이터베이스·Realtime·GitHub 저장 모델 변경
- 공통 백엔드 프레임워크나 모든 Workspace 기능을 위한 범용 서비스 플랫폼 만들기
