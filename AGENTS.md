# Agent instructions

## Task commits

- Commit each completed task separately after verifying its changes.
- Keep unrelated existing work out of a task commit.

## Spec-driven development

- Before product or code changes, read [the spec-driven development rules](docs/architecture/spec-driven-development.md) and the owning global, app, or package spec for the affected area.
- Define the starting conditions, user action, target state, observable result, and failure or recovery acceptance before implementing. Specify implementation details only when choices can change the result, compatibility, security, or data safety.
- Update the owning spec and implementation together when changing behavior, then verify the documented acceptance scenarios and state any remaining coverage gaps.

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
