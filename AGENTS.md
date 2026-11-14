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

## Spec-driven development

- Before product or code changes, read [the spec-driven development rules](docs/architecture/spec-driven-development.md), the docs index for the owning scope, and the specific global/app/package spec for the affected behavior. If the behavior crosses scopes, inspect and update each owner rather than placing all detail at the top level.
- Write or revise result-based acceptance first: starting conditions, user action, target state, observable result, and failure/cancel/retry/recovery outcome where relevant. Specify implementation details only when choices can alter user-visible results, compatibility, security, concurrency, persistence, or data safety.
- Separate current implementation facts from intended behavior. Do not treat code links, source digests, or the existence of a document as proof that the requirement is specified or verified.
- Update the owning spec and implementation in the same task. Add or revise automated checks for repeatable behavior and perform the requested UI/runtime acceptance when the behavior crosses Electron, browser, OS, or packaged-app boundaries. Document any acceptance that remains manual or unverified.
- After source changes, run the architecture-spec checker and refresh its index only after reviewing source/spec alignment. Include only intentional index changes in the task commit.
- For defects, trace the full event/data path from user action through owning process/provider to rendered result; add regression coverage at the failing boundary so the defect cannot silently return.

## CAD / CAE workflows

Skills live under `.agents/skills/`; read the relevant `SKILL.md` before CAD, DXF, URDF, G-code, or viewer work. CAD model projects and the old verification scripts are archived under `archive/models/` and `archive/scripts/`; do not treat them as active product scope.

The CAD viewer and STEP conversion still use the project Python environment. Never use system `python` for skill commands:

```bash
npm run agents:python:setup
npm run agents:python -- <args>
npm run agents:python -- -m cadgen.cli doctor .agents/skills/cad
```

Interpreter paths:

- Unix / WSL / macOS: `.agents/.venv/bin/python`
- Windows: `.agents\\.venv\\Scripts\\python.exe`
