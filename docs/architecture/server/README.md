# Server API 계약 (Cloudflare Worker)

Server scope는 provider API·OAuth·D1 저장·identity token 검증이다. Desktop의 로컬 파일과 기기 정보는 소유하지 않는다. [앱 안내](../../../apps/server/README.md)는 실행·배포 절차, 이 문서는 request 및 데이터 동작을 정의한다.

## Request와 인증

[index](../../../apps/server/src/index.ts)는 공개 `GET /api/health`, OAuth callback, `/api/services/*` 인증, service API 순으로 요청을 처리한다. 알 수 없는 경로는 404, 인증 실패는 401, 처리되지 않은 예외는 500이다. Callback은 bearer 인증 전에 저장된 OAuth state로 검증하고, 다른 계정의 state는 거부한다.

[auth](../../../apps/server/src/auth.ts)는 Authorization bearer JWT의 ES256·kid·서명·issuer·subject·audience·scope·exp·iat를 확인한다. token 수명은 최대 300초이며 미래 `iat`는 30초까지 허용한다. JWKS fetch는 5초 timeout과 5분 cache를 사용한다. issuer와 JWKS 주소는 환경 설정에서 가져오며 누락·검증 실패 시 인증을 거부한다.

## Routes

| Method/path | 동작 |
| --- | --- |
| `GET /api/services/status` | 서비스 및 public platform 상태와 갱신 시각 반환 |
| `POST /api/services/{cloudflare,supabase}/connect` | PKCE OAuth 시작 URL 반환 |
| `DELETE /api/services/{cloudflare,supabase}/connect` | grant 제거 및 provider revoke 시도 |
| `/api/services/oauth/callback` | 저장된 state를 소비하고 OAuth callback 처리 |
| `PUT/DELETE /api/services/vercel/token` | Vercel read-only token 저장·삭제 |
| `PUT/DELETE /api/services/supabase/metrics-token` | supplemental metrics token 저장·삭제 |

[serviceIntegrations](../../../apps/server/src/serviceIntegrations.ts)가 provider별 payload와 summary를 소유한다. 한 provider 오류는 다른 provider 상태를 가리지 않는다. 연결 안 됨, 권한 오류, provider 오류와 실제 0 값을 구분한다.

## OAuth와 저장 수명

OAuth state는 login/provider/verifier/createdAt와 함께 D1에 암호화해 저장한다. Callback은 유효한 state를 먼저 소비하고 10분 초과·계정 불일치·provider 오류·code 누락을 거부한다. Token은 만료 전에 갱신하며 새 refresh token이 없으면 기존 값을 보존한다.

[store](../../../apps/server/src/store.ts)는 정규화한 login을 키로 값을 upsert/delete한다. [crypto](../../../apps/server/src/crypto.ts)는 `HOME_DATA_ENCRYPTION_KEY`로 저장 값을 암호화한다. provider grant와 OAuth verifier는 server 전용이다.

## 수락·운영 상태

인증된 경로는 잘못된 issuer·audience·만료 token을 거부한다. OAuth state 재사용·만료와 provider 별 실패를 구분한다. 운영 전에는 identity issuer/JWKS 설정, OAuth client secret/callback, D1 migration을 배포 환경에서 검증한다. Desktop 로컬 Editor는 이 서비스 API에 의존하지 않는다.
