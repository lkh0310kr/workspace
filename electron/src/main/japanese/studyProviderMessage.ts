export const STUDY_PROVIDER_SETUP_MESSAGE = [
  "LLM provider가 설정되지 않았습니다.",
  "",
  "macOS + Apple Intelligence:",
  "  cd electron && npm run japanese:build-apple-fm-sidecar",
  "  Japanese 설정 → Provider: Apple Intelligence → 저장",
  "  (시스템 설정에서 Apple Intelligence 켜짐 필요)",
  "",
  "또는 Ollama:",
  "  brew install ollama && ollama serve && ollama pull llama3.2",
].join("\n");
