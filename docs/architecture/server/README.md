# Server API 계약

Server는 Cloudflare Worker로 배포하며 현재 공개 API는 상태 확인 경로 하나다. Desktop의 로컬 편집과 파일 저장은 Server에 의존하지 않는다.

## Routes

| Method/path | 동작 |
| --- | --- |
| `GET /api/health` | `{ "ok": true, "service": "workspace-server" }` 반환 |
| 그 외 모든 경로 | `404`와 `{ "error": "not_found" }` 반환 |

Worker 설정과 배포 절차는 [Server 안내](../../../apps/server/README.md)를 따른다. 인증, OAuth, 사용자별 credential 저장소는 현재 API 범위에 포함되지 않는다.
