# Agent instructions

## text-to-cad (CAD / CAE skills)

Skills are under `.agents/skills/` (text-to-cad + workspace-ref-port). Read the
relevant `SKILL.md` before CAD, DXF, URDF, G-code, or viewer work.

### Python runtime (required)

Never use system `python` for skill commands. Use the project virtualenv:

```bash
# One-time (or after pulling dependency changes)
npm run agents:python:setup

# Run cadgen / model scripts
npm run agents:python -- <args>
```

Interpreter paths:

- Unix / WSL / macOS: `.agents/.venv/bin/python`
- Windows: `.agents\.venv\Scripts\python.exe`

Verify install: `npm run agents:python -- -m cadgen.cli doctor .agents/skills/cad`

### CAD workflow defaults

- Put user CAD projects under `models/<name>/` at the repo root.
- Run model scripts from that project directory (cwd matters for output paths).
- Example:

```bash
cd models/smoke-test
npm run agents:python -- bracket.py
npm run agents:python -- -m cadgen.cli step inspect refs bracket.step --facts
```

- For browser preview of STEP/meshes, use the **cad-viewer** skill
  (`cadgen viewer` via the venv above).

### Skill updates

```bash
npx skills add earthtojake/text-to-cad --all
npm run agents:python:setup
```
