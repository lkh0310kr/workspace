# Agent instructions

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
