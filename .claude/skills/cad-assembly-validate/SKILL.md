---
name: cad-assembly-validate
description: Validate cadgen assembly STEP files — topology, interference, mate deltas, and project-specific layout contracts. Use after building or editing assembly.py, when parts float or clash, or before marking an assembly phase complete.
---

# CAD assembly validation

Extends `$cad` inspection with **assembly-specific** checks learned from bench projects.

## When to use

- After `assembly.py` changes or before closing an assembly phase
- User reports floating parts, wrong belt/cam alignment, or mate drift
- Before URDF / viewer handoff

## Quick run (workspace)

```bash
npm run agents:cad:assembly-validate -- models/<project>
```

Rebuilds `src/assembly.py`, then runs validate + interfere + layout contract.

## Manual sequence (from repo root)

```bash
npm run agents:python -- models/<project>/src/assembly.py --force
npm run agents:python -- -m cadgen.cli step inspect validate models/<project>/STEP/assembly.step
npm run agents:python -- -m cadgen.cli step inspect interfere models/<project>/STEP/assembly.step --format json
npm run agents:python -- models/<project>/src/lib/assembly_validate.py
```

## Required project files

| File | Purpose |
|------|---------|
| `bench/assembly-contract.md` | Human-readable mate datums and world frames |
| `src/lib/layout.py` | Single source of truth for world positions |
| `src/lib/assembly_validate.py` | Numeric checks (centers, gaps, coaxiality) |

## Part authoring rules (bench lessons)

Read `references/bench-lessons.md`. Summary:

1. **Foot at origin** — each part's primary mount datum is `(0,0,0)` in its local frame after reorigin.
2. **One shift per mate** — do not stack `coaxial` + extra `Pos` on the same axis unless you know the joint won't double-translate.
3. **layout.py owns world math** — no magic numbers in `assembly.py`.
4. **Explicit `Pos` escape hatch** — when `AssemblyHelper` fights you, place with `bd.Pos(layout.world(...)) * part()` and document why in the contract.
5. **Rebuild before inspect** — `validate` / `interfere` read STEP on disk, not stale sources.

## Pass criteria

- `validate`: `ok: true`, zero failures
- `interfere`: no inter-part `clashes` above tolerance (default 1000 mm³)
- `assembly_validate.py`: all contract checks `pass`
- Viewer snapshot: no obvious float (optional; encode recurring findings as new checks)

## Report format

```text
Assembly validation — <project>
- rebuild: OK (<ms>)
- validate: OK (N occurrences)
- interfere: OK / FAIL (list clashes)
- layout contract: OK / FAIL (list deltas)
```

Fix failures in **layout.py or part datums first**, then assembly mates.
