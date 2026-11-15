# PKMS Web

현재 앱의 경계·상태·계약은 [app scope 문서](../../docs/architecture/pkms/web/README.md)를 기준으로 합니다.

`/`의 기본 PKMS UI는 browser에서 Google Drive API로 직접 연결하며 중간 PKMS sync Worker/server를 data path에 사용하지 않는다. OAuth access token은 memory-only, outbox/document cache는 IndexedDB에 저장하고, tree는 branch별로 읽으며 Markdown 본문은 파일 open 시 lazy-load한다. 기존 API-backed 제품은 `/existing-pkms`에 migration fallback으로 남아 있다.

Worker는 기존 fallback 및 `/api/*`, `/.well-known/*`, `/mcp`, `/oauth/*`를 위해 유지되며 해당 경로는 독립 PKMS API Worker인 `pkms-cloud`를 사용한다. Google Drive route는 이 service proxy를 통한 파일 CRUD/sync를 호출하지 않는다.

## 개발

저장소 root에서 workspace 의존성을 설치한 뒤 실행한다.

```sh
npm run pkms:web:dev
```

로컬 Web 개발에서는 `wrangler.jsonc`의 `PKMS_SERVER_ORIGIN`을 로컬 PKMS Worker로 지정할 수 있다. Electron app은 PKMS API Worker를 직접 호출한다.

## 배포

```sh
npm run pkms:web:typecheck
npm run pkms:web:deploy
```

Web Worker는 `https://pkms-web.lkh0310kr.workers.dev`에 별도로 배포한다. 직접 방문은 등록된 GitHub OAuth callback과 host-only session cookie를 유지하기 위해 기존 canonical origin인 `https://pkms-cloud.lkh0310kr.workers.dev`으로 redirect한다. PKMS API Worker는 service binding으로 page 요청을 이 Worker에 전달하고 API 요청은 API Worker에서 처리한다. 이후 공개 domain으로 이전하려면 OAuth callback과 session migration을 함께 계획한 뒤 Web Worker origin을 canonical로 바꾼다.
