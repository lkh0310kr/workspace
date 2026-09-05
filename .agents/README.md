# Agent skills

Project agent skills live here. Cursor, Claude Code, and Codex all read from
`.agents/skills/`.

| Path | Purpose |
|------|---------|
| `skills/` | Skill definitions (`SKILL.md` + references/scripts) |
| `python/` | Shared Python requirements for CAD/CAE skills |
| `.venv/` | Local virtualenv (created by setup; gitignored) |

## Skills

- **workspace-ref-port** — port patterns from `ref-proj/` into `apps/workspace/`
- **text-to-cad** (11 skills) — CAD, DXF, URDF, G-code, DfAM, etc. ([source](https://github.com/earthtojake/text-to-cad))

`.claude/skills/` contains symlinks into `skills/` for Claude Code. Do not edit
skills there; change files under `skills/` instead.

Update text-to-cad skills from the repo root:

```bash
npx skills add earthtojake/text-to-cad --all
```

## Python environment

CAD skills need Python 3.11+ and a project virtualenv:

```bash
npm run agents:python:setup
npm run agents:cad:verify    # smoke-test: builds models/smoke-test/bracket.step
```

Run tools with the venv interpreter (macOS/Linux/WSL):

```bash
npm run agents:python -- -m cadgen.cli step inspect --help
npm run agents:python -- -m playwright install chromium   # first-time browser for viewer
```

On Windows (PowerShell/cmd), the same npm scripts work; the venv lives at
`.agents\.venv\Scripts\python.exe`.

Tell agents to use this interpreter for skill commands:

```
.agents/.venv/bin/python          # Unix / WSL / macOS
.agents\.venv\Scripts\python.exe  # Windows
```

Or activate the venv in your shell before running skill workflows.
