# Japanese Study Assist

PKMS 일본어 노트 보조 기능. 에디터에서 일본어 줄을 선택하면 사전 DB로 먼저 분석하고, 필요 시 LLM provider로 번역·힌트·연습문을 생성한다.

## 에디터 사용법

Markdown 에디터에서 일본어 텍스트를 **드래그로 선택**한 뒤 **우클릭**하면 Study 메뉴가 열립니다.

| 메뉴 | 동작 |
|------|------|
| 일본어 분해 | 사전 분해 + gloss note |
| 한국어 번역 | 한국어 한 줄 삽입 |
| 읽기 (히라가나) | 히라가나 한 줄 삽입 |
| 문법 힌트 / 번역 확인 / 연습 문장 | LLM provider 사용 |

## Provider 추가

1. `electron/src/main/japanese/llm/types.ts`의 `StudyLlmProvider` 구현
2. `electron/src/main/japanese/studyConfig.ts`에서 `registerStudyLlmProvider()` 호출
3. 설정 UI `JapaneseStudySettings.tsx`에 옵션 추가

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
