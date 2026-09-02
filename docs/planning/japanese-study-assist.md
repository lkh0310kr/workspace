# Japanese Study Assist

PKMS 일본어 노트 보조 기능. 에디터에서 텍스트를 선택하면 사전 DB로 분석하고, LLM provider로 대화형 도움을 받을 수 있다.

## 에디터 사용법 (Copilot-style)

Markdown·일반 텍스트 에디터 공통:

1. **텍스트 드래그 선택** → 선택 끝 근처에 **Study 채팅 아이콘** 표시
2. 아이콘 클릭 → **인라인 채팅 패널** 열림
3. 자유롭게 질문 (번역, 읽기, 문법, 예문, 뉘앙스 등) — **대화형 튜터**가 맥락·사전 정보를 참고해 답함
4. **답변 삽입** → 현재 줄 아래에 문서에 반영 (Markdown은 `>` blockquote)

같은 파일·같은 선택 범위로 채팅을 다시 열면 **이전 대화가 복원**됩니다 (`user.db`). 헤더의 **대화 지우기**로 세션만 초기화할 수 있습니다.

우클릭 메뉴·고정 태스크 버튼은 제거했다. **문서 중심 자유 채팅**이 기본이다.

## 쓰기 축 — `/증강` (Markdown)

Markdown 노트에서 `/` → **ai › 증강**으로 문서 전체를 읽고 빠진 개념·예제·할 일 등을 **같은 형식**으로 제안받는다. 삽입 전 **미리보기**에서 확인한다.

자세한 스펙: [document-augment-slash-commands.md](./document-augment-slash-commands.md)

## Provider 추가

기본 provider: **OpenAI GPT-4o mini** (`openai-compatible`).

### API key 넣는 곳

1. **앱 UI (권장)** — 일본어 사전 탭 → ⚙ 설정 → Study Assist → OpenAI → API key → 저장
2. **설정 파일** — `~/Library/Application Support/workspace-app-dev/config.electron.json` (dev)

```json
{
  "japaneseStudy": {
    "providerId": "openai-compatible",
    "openaiCompatible": {
      "baseUrl": "https://api.openai.com/v1",
      "model": "gpt-4o-mini",
      "apiKey": "sk-..."
    }
  }
}
```

환경 변수 `OPENAI_API_KEY`도 main 프로세스에서 읽습니다.

설정 후 **연결 테스트** 버튼으로 확인하세요.

### Built-in providers

| id | 설명 |
|----|------|
| `stub` | 오프라인 placeholder |
| `ollama` | 로컬 Ollama `POST /api/chat` |
| `openai-compatible` | OpenAI Chat Completions 호환 HTTP |
| `apple-fm` | macOS 26+ Foundation Models sidecar |

설정은 `config.electron.json`의 `japaneseStudy` 섹션에 저장된다.

## Apple FM sidecar

`electron/resources/japanese/apple-fm-sidecar/` — macOS 26+에서 `swiftc`로 빌드 후 `apple-fm-sidecar` 바이너리를 resources에 배치.

## UX 참고

Copilot 인라인 채팅 패턴 리서치: `docs/planning/japanese-study-assist-copilot-ux-research.md`
