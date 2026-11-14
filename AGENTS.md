# Agent instructions

## Execution discipline

- Treat the user's latest request as the active task while preserving earlier unfinished requirements in the same thread. Acknowledge steering and continue the original task unless the user clearly cancels it.
- Convert the request into observable outcomes before editing. Inspect the current implementation, call sites, owning specs, existing tests, and relevant runtime boundary; do not make a narrow cosmetic patch when the reported failure points to a boundary or lifecycle problem.
- Continue through implementation and the requested verification. Do not report completion based only on code inspection or a successful build when the requested behavior needs a runtime check.
- Report what changed, what exact checks ran and their results, what was not verified, and any remaining limitation. Never claim a test, UI interaction, release promotion, or runtime check that was not actually performed.
- Preserve user work already present in the worktree. Inspect `git status` before editing, do not revert or reformat unrelated changes, and stage only files belonging to the active task.
- Do not stop to ask for confirmation for reversible work already requested. Ask only when a decision materially changes user-visible behavior and cannot be inferred from the request or existing product contract.

## Reference projects and product behavior

- When the user names a reference product or the repo contains an authorized reference checkout (for example `ref-proj/vscode`), inspect the relevant source/spec and document the observed behavior before implementing parity. Prefer the smallest source path that proves the behavior; do not assume that matching a shortcut label is sufficient.
- Keep reference projects read-only unless the user explicitly asks to modify them. Do not include reference checkouts or their generated files in product commits.
- For desktop behavior, distinguish renderer DOM events, Electron host `webContents`, guest webview events, preload IPC, and packaged/runtime behavior. Verify the path through the boundary that owns the failure.

## Task commits

- Commit each independently completed task separately, after its implementation, spec update, and relevant verification are complete.
- Before committing, review the staged diff and status. Stage explicit paths; never use a broad add that can capture unrelated user work.
- Keep documentation/process changes (including this file) in their own commit when they are a separate task from product behavior. Do not combine unrelated fixes merely because they were discovered together.
- If verification fails, fix the cause and rerun the affected check before committing. If a check cannot run, state why and do not describe the task as fully verified.

## Spec Driven Development
- 제품 또는 코드 변경 전에 관련 개발 규칙, 문서 인덱스 및 담당 스펙을 먼저 확인하세요. 여러 범위에 영향을 주는 경우 각 담당 스펙을 검토하고 업데이트하세요. (참고: [스펙 기반 개발 규칙](docs/architecture/spec-driven-development.md))
- 제품 스펙, 설계 문서와 상세 개발 가이드는 저장소 root의 `docs/` 아래에서 관리하세요. `apps/`나 `packages/` 내부에 별도 `docs/` 트리를 만들지 말고, 상세 문서를 모듈 소스 경로에 분산하지 마세요. App/package README는 진입 안내와 실행 방법을 제공하고, 자세한 내용은 root `docs/`에 연결하세요.
