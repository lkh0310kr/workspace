# Workspace Home Server 계약

App scope는 Home provider API·OAuth·D1 저장·token 검증이다. Desktop 기기 metrics와 PKMS 문서 저장을 소유하지 않는다. [앱 README](../README.md)는 환경과 배포 절차, 이 문서는 현재 request와 상태 동작을 정의한다.

## Request와 Home auth

[index](../src/index.ts)는 공개 GET /api/health → OAuth callback → /api/services/* 인증 → service API 순으로 처리한다. 그 외 path는 404, auth 실패는 401, uncaught 오류는 workspace_home_request_failed 500이다. callback은 bearer 인증 전에 stored OAuth state로 검증한다.

[auth](../src/auth.ts)는 Authorization bearer의 ES256·kid·서명, issuer, subject, audience(기본 workspace-home), scope workspace-home, exp/iat를 검사한다. 만료 거부, 미래 iat는 30초 허용, token lifetime은 최대 300초다. 선택적 ALLOWED_GITHUB_LOGIN도 검사한다. JWKS fetch timeout 5초, cache 5분이다. token 검증 실패는 null이며 새로운 key의 즉시 refresh를 항상 보장한다고 가정하지 않는다.

## Routes

| method/path | 입력/결과 |
|---|---|
| GET /api/services/status | services/cloudflare·supabase·vercel, public platforms, updatedAt |
| POST /api/services/cloudflare/connect | PKCE OAuth URL 또는 oauth_not_configured 503 |
| POST /api/services/supabase/connect | 동일 provider 연결 |
| DELETE 해당 connect | grant 제거, provider revoke 시도 |
| /api/services/oauth/callback | stored state 소비 후 성공/실패 callback HTML |
| PUT /api/services/vercel/token | trim한 token, 비문자/빈 값/8192 초과 거부 |
| DELETE /api/services/vercel/token | 저장 token 제거 |
| PUT/DELETE /api/services/supabase/metrics-token | 별도 supplemental token 관리 |

[serviceIntegrations](../src/serviceIntegrations.ts)가 실제 payload와 provider별 summary를 소유한다. 전체 status는 병렬 수집하며 한 provider 오류는 connected=true/error=metrics_unavailable 형태로 격리한다. not configured·permission required·provider error·inactive·no data와 actual zero usage를 구분한다.

## OAuth와 저장 수명

connect는 random state와 verifier를 만들고 SHA-256/S256 challenge를 제공한다. state는 login/provider/verifier/createdAt를 암호화해 D1에 저장한다. callback은 allowed login의 state를 조회해 유효한 record를 먼저 제거하고 10분 초과·다른 login·provider error·code 부재를 실패 처리한다. 코드 교환 후 access/refresh token과 expiresAt·connectedAt를 저장한다.

access token은 만료 60초 전 refresh를 시도하며 refresh token이 없으면 연결 token을 돌려주지 못한다. 새 refresh token이 없을 때 기존 값을 보존한다. disconnect의 revoke 실패가 storage 제거 동작과 같은 실패 의미라고 일반화하지 않는다.

[store](../src/store.ts)는 login을 소문자로 정규화한 home_values(login,value_key,value_json)를 upsert/delete한다. [crypto](../src/crypto.ts)는 HOME_DATA_ENCRYPTION_KEY 기반 encryption을 제공한다. grants·supplemental tokens·OAuth verifier는 server 전용이며 renderer에 반환하지 않는다. callback의 login 조회는 현재 단일 allowed-account 운영을 전제한다.

## 수락·운영 상태

HOME-01 잘못된 audience/issuer/만료 token 거부. HOME-02 callback state 소비/만료·취소 구분. HOME-03 OAuth 미설정은 disconnected와 구분. HOME-04 provider 하나 실패해도 다른 서비스 상태 보존. HOME-05 token 삭제 후 status disconnected. HOME-06 CPU/디스크 summary는 Desktop local 경로이며 이 API가 아님.

검증 명령은 root `npm run workspace:server:typecheck`다. 실제 OAuth client secrets/callback 설정·reconnect와 D1 migration 적용은 운영 acceptance다. 이 문서화로 완료 처리하지 않는다. 현재 독립 behavioral test suite는 없으며 fake provider/JWKS/clock fixtures가 후속 작업이다.
