# Server

Server는 상태 확인용 `GET /api/health`만 제공하는 Cloudflare Worker다. Desktop의 로컬 편집 흐름은 Server에 의존하지 않는다. Wrangler 설정의 배포 이름 `workspace-home`은 기존 Worker 배포 대상을 가리키는 운영 식별자이며 제품·앱 이름이 아니다. 이를 변경하면 다른 Worker가 배포될 수 있다.

## 개발·배포

저장소 root에서 의존성을 설치한 뒤 다음 명령으로 타입을 검사하고 배포한다.

```sh
npm run server:typecheck
npx wrangler deploy --config apps/server/wrangler.jsonc
```

## 로컬 개발

`npx wrangler dev --config apps/server/wrangler.jsonc`를 실행한다. `GET /api/health` 응답에서 Worker 상태를 확인할 수 있다.
