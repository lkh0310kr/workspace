# Server

Cloudflare Worker 기반 서비스 API다. Cloudflare·Supabase OAuth 자격 증명, 선택적 Supabase metrics token, Vercel read-only token을 암호화해 D1에 저장한다.

인증된 API는 배포 환경의 `IDENTITY_ISSUER`, `IDENTITY_JWKS_URL`, `IDENTITY_TOKEN_AUDIENCE` 설정으로 검증한 짧은 수명의 서명 JWT를 요구한다. 신뢰할 identity issuer와 JWKS를 설정하지 않으면 API는 fail closed 한다. 현재 Desktop 편집 흐름은 이 API에 의존하지 않는다.

배포 시 Worker와 D1의 기존 리소스 이름은 `workspace-home`이다. 이 이름은 Desktop·Server 앱 디렉터리 이름과 별개의 운영 리소스 식별자다.

## 개발·배포

저장소 root에서 의존성을 설치한 뒤 다음 명령으로 타입을 검사하고 배포한다.

```sh
npm run server:typecheck
npx wrangler d1 migrations apply workspace-home --remote --config apps/server/wrangler.jsonc
npx wrangler secret put HOME_DATA_ENCRYPTION_KEY --config apps/server/wrangler.jsonc
npx wrangler deploy --config apps/server/wrangler.jsonc
```

provider 연결을 활성화하려면 `HOME_DATA_ENCRYPTION_KEY`, Cloudflare OAuth client ID/secret, Supabase OAuth client ID/secret을 Worker secret으로 설정한다. OAuth callback은 `https://workspace-home.lkh0310kr.workers.dev/api/services/oauth/callback`이다.

## 로컬 개발

`npx wrangler dev --config apps/server/wrangler.jsonc`를 실행한다. Worker secret은 Git에서 무시되는 `.dev.vars`에 둔다. 로컬 D1에는 같은 migrations를 적용한다.
