# PKMS Server app 계약

App scope는 Cloudflare Worker의 HTTP/MCP/auth·account/vault·Supabase/R2·GitHub export다. [제품 context](../../../docs/architecture/01-overview.md), [DTO](../../../packages/pkms-protocol/src/types.ts), [Realtime schema](../../../packages/pkms-protocol/realtime.schema.json)를 연결한다. Web UI 렌더링은 별도 Web Worker의 책임이다.

## 요청 dispatch와 인증

[app.ts](../src/app.ts)는 request ID와 timing을 만들고 공개 OIDC/JWKS → MCP/OAuth route → 일반 auth/API → Web page service 순으로 처리한다. 일반 page forwarding은 PKMS_WEB_ORIGIN과 PKMS_WEB binding을 사용하고 X-PKMS-Web-Internal=1을 설정한다. 101 upgrade 응답은 보존하고 일반 응답에는 X-Request-ID를 넣는다.

/api/health와 auth routes 이후 일반 API는 bearer 또는 __Host-pkms_session cookie를 검증한다. 현재 allowed GitHub account는 코드 상수의 단일 계정이다. PKMS가 임의 다중 tenant의 공개 가입 제품이라고 가정하지 않는다. MCP session은 tokenType/audience/활성 token과 read/write scopes를 추가 검증한다. Home token 발급은 MCP client를 거부한다. 일반 workspace API에는 sameOrigin 정책을 적용한다.

## 실제 route 책임 지도

| prefix/route                       | owner                            | 계약                                                           |
| ---------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| /api/health                        | app.ts                           | 공개 health와 protocolVersion                                  |
| /api/auth/github, callback         | authRoutes.ts, MCP callback      | browser redirect·state·grant exchange·cookie                   |
| /api/auth/device/start, poll       | authRoutes.ts                    | native device flow, pending/interval/token·user                |
| /api/session, /api/logout          | authRoutes.ts                    | session 조회/해제                                              |
| /api/home/access-token             | app.ts/realtimeAuth.ts           | authenticated native session→Home audience token, 미준비 503   |
| /api/realtime/config, token        | workspaceApi.ts/realtimeAuth.ts  | Supabase public config·짧은 signed auth                        |
| /api/repositories, /api/workspaces | workspaceApi.ts                  | GitHub repo 권한과 연결, account별 목록                        |
| /api/workspaces/:id/*              | workspaceApi.ts→SupabaseVault.ts | account membership 확인 후 내부 vault path 전달                |
| /mcp, /oauth/*, 관련 well-known    | mcp.ts                           | client registration·consent·PKCE·scope·revocation·MCP dispatch |

vault 내부 route는 아래와 같다. 외부 path에는 `/api/workspaces/:id` prefix가 붙는다.

| 내부 path                   | 동작/동시성                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| GET /snapshot               | legacy Markdown 목록, revision-pinned pagination                 |
| GET /sync/tree              | Markdown+folder metadata, atRevision 검증·path 순서·1,000개 page |
| GET /sync/changes           | cursor 기반 변경/tombstone                                       |
| POST /sync/download         | Markdown batch bodies; 상세 limit/오류는 vault 구현              |
| GET /directory              | GitHub tree lazy loading와 directory listing                     |
| GET /sync-status            | server revision·GitHub export 상태                               |
| POST /operations            | create/move/delete·operation identity·revision guard             |
| GET/POST /files/:id/updates | Yjs state vector/full state·incremental update                   |
| POST /flush, /mirror        | GitHub export/import 조정. flush lease 충돌은 409/Retry-After    |
| POST /diagnostics/realtime  | 허용된 진단 필드만 기록; token/raw message logging 아님          |

file metadata/content/attachment/upload의 나머지 분기는 [SupabaseVault](../src/SupabaseVault.ts)에서 확인한다. 이 지도는 모든 HTTP response field를 정식 검증한 endpoint schema가 아니다. 실제 client DTO·handler와 세부 오류 fixture를 연결하는 작업이 남아 있다.

## 저장과 background 작업

[SupabaseAccountStore](../src/SupabaseAccountStore.ts)는 login별 credentials/workspace/MCP 자료, SupabaseVault는 document·metadata·operation/revision·GitHub 상태를 조정한다. binary object는 R2, 관계/guard/idempotency는 Supabase RPC와 [migrations](../supabase/migrations)가 함께 소유한다. JS source 변경만으로 DB migration 적용을 완료했다고 판단하지 않는다.

scheduled handler는 flushDueWorkspaces와 mirrorDueWorkspaces를 waitUntil로 실행한다. local save, cloud revision, GitHub flush/mirror는 독립 상태다. write concurrency와 folder guard는 [Desktop sync](../../workspace-app/docs/pkms/README.md)를 소비하지만 서버의 실제 검증은 vault/RPC가 결정한다.

## 오류·검증

미인증 401, 계정/scope/origin 거부 403, workspace 부재 404, lease 충돌 409, upstream export 오류 502, Home signer 미준비 503을 구분한다. uncaught 오류는 callback/MCP/일반 요청별 안전한 응답을 반환하고 trace는 민감 body/message 대신 error type과 stack frame을 기록한다.

SERVER-01 로그인/권한 거부, SERVER-02 route별 auth/context, SERVER-03 operation retry와 stale delete 보존, SERVER-04 CRDT update와 revision/cache 일치, SERVER-05 lease 실패 후 복구, SERVER-06 canonical page forwarding을 수락 기준으로 둔다. root `npm run pkms:server:typecheck`, linkRewrite/yjsLinkFlow test, Realtime model check가 일부 근거다. DB migration·다중 기기·MCP consent·실제 GitHub export acceptance는 별도 기록이 필요하다.
