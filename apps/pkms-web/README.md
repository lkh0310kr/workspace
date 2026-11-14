# PKMS Web

현재 앱의 경계·상태·계약은 [app scope 문서](../../docs/architecture/pkms/web/README.md)를 기준으로 합니다.

이 app은 browser UI와 React Router SSR을 소유한다. Worker는 `/api/*`, `/.well-known/*`, `/mcp`, `/oauth/*`를 독립 PKMS API Worker인 `pkms-cloud`로 proxy한다. Browser 요청은 same-origin을 유지하고 인증, 저장, 협업, MCP와 GitHub backup은 PKMS server가 소유한다.

## Development

저장소 root에서 workspace 의존성을 설치한 뒤 실행한다.

```sh
npm run pkms:web:dev
```

로컬 Web 개발에서는 `wrangler.jsonc`의 `PKMS_SERVER_ORIGIN`을 로컬 PKMS Worker로 지정할 수 있다. Electron app은 PKMS API Worker를 직접 호출한다.

## Deploy

```sh
npm run pkms:web:typecheck
npm run pkms:web:deploy
```

Web Worker는 `https://pkms-web.lkh0310kr.workers.dev`에 별도로 배포한다. 직접 방문은 등록된 GitHub OAuth callback과 host-only session cookie를 유지하기 위해 기존 canonical origin인 `https://pkms-cloud.lkh0310kr.workers.dev`으로 redirect한다. PKMS API Worker는 service binding으로 page 요청을 이 Worker에 전달하고 API 요청은 API Worker에서 처리한다. 이후 공개 domain으로 이전하려면 OAuth callback과 session migration을 함께 계획한 뒤 Web Worker origin을 canonical로 바꾼다.
