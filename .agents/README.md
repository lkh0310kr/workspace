# 에이전트 스킬

프로젝트에서 사용하는 에이전트 스킬을 여기에 둔다. Cursor, Claude Code, Codex는 모두
`.agents/skills/`를 읽는다.

| 경로 | 용도 |
|------|---------|
| `skills/` | 스킬 정의 (`SKILL.md`와 참조 문서/스크립트) |
| `python/` | CAD/CAE 스킬이 공유하는 Python 요구 사항 |
| `.venv/` | 로컬 가상 환경 (설정 명령이 만들며 Git에서 무시됨) |

## 스킬

- **workspace-ref-port** — `ref-proj/`의 패턴을 `apps/workspace/`에 이식
- **text-to-cad** (11개 스킬) — CAD, DXF, URDF, G-code, DfAM 등 ([원본](https://github.com/earthtojake/text-to-cad))

`.claude/skills/`에는 Claude Code가 사용하는 `skills/` 내부 링크가 있다. 그 경로에서는 스킬을 편집하지 말고,
대신 `skills/` 아래의 파일을 수정한다.

저장소 root에서 다음 명령으로 text-to-cad 스킬을 업데이트한다.

```bash
npx skills add earthtojake/text-to-cad --all
```

## Python 환경

CAD 스킬에는 Python 3.11 이상과 프로젝트 가상 환경이 필요하다.

```bash
npm run agents:python:setup
npm run agents:cad:verify    # smoke-test: builds models/smoke-test/bracket.step
```

가상 환경의 Python으로 도구를 실행한다 (macOS/Linux/WSL).

```bash
npm run agents:python -- -m cadgen.cli step inspect --help
npm run agents:python -- -m playwright install chromium   # first-time browser for viewer
```

Windows (PowerShell/cmd)에서도 같은 npm 스크립트를 사용할 수 있다. 가상 환경은 다음 위치에 있다.
`.agents\.venv\Scripts\python.exe`.

스킬 명령을 실행할 때는 에이전트가 다음 인터프리터를 사용하도록 한다.

```
.agents/.venv/bin/python          # Unix / WSL / macOS
.agents\.venv\Scripts\python.exe  # Windows
```

또는 스킬 작업을 시작하기 전에 셸에서 가상 환경을 활성화한다.
