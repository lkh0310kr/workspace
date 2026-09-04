# Japanese Study Assist

PKMS 일본어 노트 보조 기능. Markdown 에디터에서 `/` 슬래시 커맨드로 문서를 자동 보강할 수 있다.

## 쓰기 — `/증강` (Markdown)

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

`apps/workspace/resources/japanese/apple-fm-sidecar/` — macOS 26+에서 `swiftc`로 빌드 후 `apple-fm-sidecar` 바이너리를 resources에 배치.
