# 문서 안내

제품 문서는 이 저장소의 `docs/` 한곳에서 관리합니다. 앱이나 패키지 소스 폴더에 별도의 문서 트리를 만들지 않습니다. **현재 구현의 기준은 코드**, 예정 기능의 기준은 `planning/` 문서입니다. 조사·이전 이력은 현재 계획으로 취급하지 않습니다.

## Global scope

- [제품 범위와 사용자 여정](./product/프로젝트%20정의.md)
- [문서 scope·소유 규칙](./documentation-scopes.md)
- [전체 시스템 context](./architecture/01-overview.md)

## 어디서 찾나요?

| 알고 싶은 것                                | 문서                                                                                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 현재 시스템과 기능 계약은 무엇인가          | [시스템 아키텍처와 기능 문서](./architecture/README.md)                                                                                                                                  |
| 어떤 일을 진행하거나 계획 중인가            | [계획 문서 색인](./planning/README.md)                                                                                                                                                  |
| 문서 누락·불일치와 SDD 전환 순서는 무엇인가 | [전체 감사](./planning/top-down-documentation-audit.md) · [결과 중심 원칙 점검](./planning/result-oriented-spec-review.md) · [실행 계획](./planning/spec-driven-development-roadmap.md) |
| 개발·QA·디자인 절차는 무엇인가              | [가이드 색인](./guides/README.md)                                                                                                                                                       |
| 보관된 기능과 이전 조사는 어디에 있는가     | [아카이브 색인](../archive/README.md)                                                                                                                                                   |

## 문서 원칙

- 각 주제에는 기준 문서를 하나만 둡니다. 다른 문서는 상세 계약을 복제하지 말고 기준 문서로 연결합니다.
- 계획 문서에는 채택된 작업만 둡니다. 보관 코드는 최상위 `archive/`에 둡니다.
- 문서는 한국어를 기본으로 씁니다. 코드 식별자, 경로, 명령, 외부 API 이름은 원문을 유지합니다.
- 파일을 삭제하거나 문서 내용을 합치기 전에는 후보와 보존 위치를 먼저 검토합니다.

## 전체 기능 문서

앱과 패키지에 걸친 기능별 계약은 아키텍처 색인에서 찾습니다. 문서의 소유 책임은 유지하되 파일은 저장소 루트의 `docs/` 아래에 모읍니다.

- [Workspace](./architecture/workspace/README.md)
- [Editor](./architecture/editor/README.md)
- [PKMS](./architecture/pkms/README.md)
- [Workspace Home Server](./architecture/workspace-server/README.md)
