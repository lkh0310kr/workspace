# 문서 안내

문서는 상태와 용도에 따라 나눕니다. **현재 구현의 기준은 코드**, 예정 기능의 기준은 `planning/` 문서입니다. 조사·이전 이력은 현재 계획으로 취급하지 않습니다.

## Global scope

- [제품 범위와 사용자 여정](./product/README.md)
- [문서 scope·소유 규칙](./documentation-scopes.md)
- [전체 시스템 context](./architecture/01-overview.md)

## 어디서 찾나요?

| 알고 싶은 것 | 문서 |
|---|---|
| 현재 시스템이 어떻게 동작하는가 | [시스템 아키텍처](./architecture/README.md) |
| 어떤 일을 진행하거나 계획 중인가 | [계획 문서 색인](./planning/README.md) |
| 문서 누락·불일치와 SDD 전환 순서는 무엇인가 | [전체 감사](./planning/top-down-documentation-audit.md) · [결과 중심 원칙 점검](./planning/result-oriented-spec-review.md) · [실행 계획](./planning/spec-driven-development-roadmap.md) |
| 개발·QA·디자인 절차는 무엇인가 | [가이드 색인](./guides/README.md) |
| 보관된 기능과 이전 조사는 어디에 있는가 | [아카이브 색인](../archive/README.md) |

## 문서 원칙

- 각 주제에는 기준 문서를 하나만 둡니다. 다른 문서는 상세 계약을 복제하지 말고 기준 문서로 연결합니다.
- 계획 문서에는 채택된 작업만 둡니다. 보관 코드는 최상위 `archive/`에 둡니다.
- 문서는 한국어를 기본으로 씁니다. 코드 식별자, 경로, 명령, 외부 API 이름은 원문을 유지합니다.
- 파일을 삭제하거나 문서 내용을 합치기 전에는 후보와 보존 위치를 먼저 검토합니다.

## App scope

실행·배포·OS 권한·서비스 저장의 동작은 앱이 소유합니다.

- [Workspace Desktop](../apps/workspace-app/docs/README.md)
- [PKMS Web](../apps/pkms-web/docs/README.md) · [PKMS Server](../apps/pkms-server/docs/README.md) · [PKMS iOS](../apps/pkms-ios/docs/README.md)
- [Workspace Home Server](../apps/workspace-server/docs/README.md)

## Package scope

공유 API와 플랫폼 독립 동작은 패키지가 소유합니다.

- [Editor](../packages/editor/docs/README.md)
- [PKMS client](../packages/pkms-client/docs/README.md)
- [PKMS protocol](../packages/pkms-protocol/README.md)
- [PKMS Core·FFI·WASM](../packages/pkms-core/README.md)
