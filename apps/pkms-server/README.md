# PKMS Server

현재 앱의 경계·상태·계약은 [app scope 문서](../../docs/architecture/pkms/server/README.md)를 기준으로 합니다.

이 Cloudflare Worker는 Web, Workspace Desktop, iOS, MCP client가 함께 사용하는 PKMS backend다. PKMS 인증, workspace/document API, Supabase 저장, Realtime token 발급, GitHub backup, MCP endpoint를 소유한다. Web UI를 직접 렌더링하지 않는다.

기존 secret, R2 bucket, cron과 공개 API origin을 유지하기 위해 Worker는 `pkms-cloud`로 배포한다. Web app은 별도 Worker를 사용하고 같은 origin의 browser API 요청을 이곳으로 전달한다. Desktop 등 native client는 API origin을 직접 호출할 수 있다.

## Development and deployment

저장소 root에서 npm workspace 의존성을 설치한다. 로컬 secret은 `.dev.vars.example`을 `.dev.vars`로 복사해 설정한 뒤 실행한다.

```sh
npm run pkms:server:typecheck
npm run pkms:server:deploy
```

배포 API origin은 `https://pkms-cloud.lkh0310kr.workers.dev`다. `PUBLIC_ORIGIN`은 이 API origin으로 설정한다. `PKMS_WEB_ORIGIN`은 GitHub OAuth callback과 기존 root redirect에 사용하는 browser app origin이다.

기존 GitHub App callback과 browser session은 `https://pkms-cloud.lkh0310kr.workers.dev/api/auth/github/callback`을 유지한다. PKMS server는 해당 origin에서 OAuth와 API 요청을 처리하고 page 요청은 service binding으로 별도 배포된 Web Worker에 전달한다. UI source와 배포를 분리하면서 기존 `__Host-pkms_session` cookie scope를 보존한다. Workspace Home token도 여기서 발급하며 `workspace-home` audience로 제한한다.

Supabase schema와 migration은 `supabase/` 아래에 있다. 사용할 Supabase project를 연결한 뒤 이 디렉터리에서 `npx supabase db push`로 적용한다.
