# PKMS Web app 계약

App scope는 React Router UI/SSR·assets·canonical origin·기존 PKMS Worker service proxy를 소유한다. 현재 `/`는 direct Google Drive route를 표시하고 browser가 Google Drive API를 직접 호출한다. 기존 API-backed PKMS UI는 `/existing-pkms`에서 migration fallback으로 남아 있으며 이 경로의 저장·인증은 [PKMS Server](../../../../apps/pkms-server/README.md)가 소유한다. Google Drive 경로는 Web 앱이 자체 backend를 거치지 않으며 browser IndexedDB만 durable local outbox/cache로 사용한다.

## Request routing

근거: [workers/web.ts](../../../../apps/pkms-web/workers/web.ts), [route tree](../../../../apps/pkms-web/app/routes.ts), [home route](../../../../apps/pkms-web/app/routes/home.tsx), [existing PKMS fallback](../../../../apps/pkms-web/app/routes/existing-pkms.tsx), [Google Drive route](../../../../apps/pkms-web/app/routes/pkms-google-drive.tsx).

| 조건                                                  | 동작                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| X-PKMS-Web-Internal 값이 1이 아님                     | path/query를 보존해 PKMS_CANONICAL_ORIGIN으로 302 redirect |
| internal + /api/, /.well-known/, /mcp, /oauth/ prefix | PKMS_SERVER service binding으로 forward                    |
| internal + 그 외 path, asset 응답이 404 아님          | ASSET_FILES 응답 그대로 반환                               |
| internal + asset 404                                  | React Router createRequestHandler로 SSR                    |

forward는 PKMS_SERVER_ORIGIN으로 path/query를 옮기고 Origin/Host header를 제거한다. GET/HEAD는 body 없이, 다른 method는 기존 body를 사용하며 redirect=manual이다. 이 internal header는 구현 routing marker이며 자체로 end-to-end authorization을 대체한다고 설명하지 않는다.

PKMS API Worker가 canonical origin의 페이지 요청에 internal header를 붙여 Web Worker로 전달한다. browser host-only session cookie와 GitHub callback은 canonical PKMS origin에 남는다. Web Worker 배포 origin으로 직접 방문하는 흐름과 일반 사용자의 canonical browser 요청을 구분한다.

## UI·상태 owner

root/entry/routes는 SSR와 hydration·route shell을 소유한다. `/`의 Google Drive route는 OAuth popup/token memory, Drive tree와 Markdown UI를 browser에서 직접 운영하며 folder branch만 조회하고 문서 본문은 열 때 내려받는다. `/existing-pkms`의 PkmsClientApp은 기존 로그인·workspace·파일·문서 흐름을 유지한다. Desktop MemoryRouter/Shadow DOM/IPC는 이 Web 앱의 책임이 아니다. shared Editor의 view/cache/preview 계약은 editor package를 따른다.

기존 PKMS fallback 및 MCP/API routing에는 ASSET_FILES, PKMS_SERVER, PKMS_SERVER_ORIGIN, PKMS_CANONICAL_ORIGIN이 필요하다. `/`의 Drive data path에는 PKMS_SERVER binding이 관여하지 않으며 Google OAuth Web client의 authorized origin과 Drive API scope 설정이 필요하다. 실제 배포 값·명령은 [앱 README](../README.md)와 wrangler config를 기준으로 한다.

## 수락과 제한

WEB-01 직접 worker origin 요청은 path/query를 보존해 redirect. WEB-02 internal asset은 SSR 없이 반환. WEB-03 internal API는 service binding과 manual redirect를 유지. WEB-04 canonical browser 로그인 이후 same-origin fetch가 session을 사용. WEB-05 shared client/editor 변경이 Web build와 배포 영향에 포함되어야 한다.

현재 deploy workflow의 packages/editor path 누락은 [감사 AUD-08](../../../planning/top-down-documentation-audit.md)의 후속 코드 작업이다. 이 문서 작업에서 수정하거나 실제 배포하지 않았다. 자동 검증은 root의 `npm run pkms:web:typecheck`; routing·cookie·SSR의 실제 통합 acceptance는 별도다.
