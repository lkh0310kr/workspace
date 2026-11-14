# Workspace Home Worker

현재 앱의 경계·상태·계약은 [app scope 문서](../../docs/architecture/workspace-server/README.md)를 기준으로 합니다.

이 Cloudflare Worker는 Workspace Home service dashboard API를 제공한다. Cloudflare/Supabase OAuth credential, 선택적 Supabase metrics token, Vercel read-only token을 소유한다. 이 값은 `HOME_DATA_ENCRYPTION_KEY`로 암호화해 Worker의 D1 database에 저장한다.

PKMS가 identity authority로 남는다. Electron main process는 PKMS에서 5분 유효한 `workspace-home` audience token을 요청해 Worker에 전달한다. Worker는 PKMS JWKS, issuer, audience, expiry, scope를 확인한다. PKMS의 session secret이나 database를 사용하지 않는다.

## Deploy

저장소 root에서 의존성을 설치하고 deploy 전에 D1 schema를 적용한다.

```sh
npm install
cd apps/workspace-server
npx wrangler d1 migrations apply workspace-home --remote
npx wrangler secret put HOME_DATA_ENCRYPTION_KEY
npx wrangler deploy
```

Provider 연결을 활성화하기 전에 다음 Worker secret을 설정한다.

- `HOME_DATA_ENCRYPTION_KEY`: base64-encoded random 32-byte key.
- `CLOUDFLARE_OAUTH_CLIENT_ID` and `CLOUDFLARE_OAUTH_CLIENT_SECRET`.
- `SUPABASE_OAUTH_CLIENT_ID` and `SUPABASE_OAUTH_CLIENT_SECRET`.

두 OAuth application의 callback을 `https://workspace-home.lkh0310kr.workers.dev/api/services/oauth/callback`으로 설정한다. 기존 provider grant는 PKMS storage에서 복사하지 않으므로 전환 후 각 provider를 다시 연결한다. Vercel과 Supabase metrics token은 Home에서 다시 입력할 수 있다.

PKMS Worker는 `/api/home/access-token`과 `wrangler.jsonc`에 설정된 JWKS endpoint를 제공해야 한다. Electron app은 로컬 개발에서 `WORKSPACE_HOME_API_ORIGIN`으로 API origin을 바꿀 수 있고 production 기본값은 배포 Worker URL이다.

## Local development

`npx wrangler dev`를 실행한다. Worker 전용 값은 Git에서 무시되는 `.dev.vars`에 둔다. 로컬 D1 database도 같은 migration 파일을 사용한다. 로컬 요청을 확인하기 전에 `npx wrangler d1 migrations apply workspace-home --local`을 실행한다.
