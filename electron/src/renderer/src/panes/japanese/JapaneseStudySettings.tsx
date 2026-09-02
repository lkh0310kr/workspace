import { useCallback, useEffect, useState } from "react";
import type { JapaneseStudyConfig, StudyLevel } from "../../../../shared/japaneseStudyTypes";
import {
  getJapaneseStudyConfig,
  getJapaneseStudyProviderStatus,
  saveJapaneseStudyConfig,
  type StudyProviderStatus,
} from "../../electron";

const PROVIDERS = [
  { id: "", label: "자동 (macOS: Apple Intelligence 우선)" },
  { id: "apple-fm", label: "Apple Intelligence (on-device)" },
  { id: "ollama", label: "Ollama" },
  { id: "openai-compatible", label: "OpenAI-compatible HTTP" },
  { id: "stub", label: "Stub (테스트용)" },
] as const;

const LEVELS: StudyLevel[] = ["auto", "N5", "N4", "N3"];

export function JapaneseStudySettings() {
  const [config, setConfig] = useState<JapaneseStudyConfig>({});
  const [providerStatus, setProviderStatus] = useState<StudyProviderStatus[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshStatus = useCallback(() => {
    void getJapaneseStudyProviderStatus().then(setProviderStatus).catch(console.error);
  }, []);

  useEffect(() => {
    void getJapaneseStudyConfig().then(setConfig).catch(console.error);
    refreshStatus();
  }, [refreshStatus]);

  const update = useCallback((patch: JapaneseStudyConfig) => {
    setConfig((prev) => ({
      ...prev,
      ...patch,
      ollama: { ...prev.ollama, ...patch.ollama },
      openaiCompatible: { ...prev.openaiCompatible, ...patch.openaiCompatible },
    }));
  }, []);

  const onSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveJapaneseStudyConfig(config);
      setConfig(saved);
      refreshStatus();
      setMessage("저장되었습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [config, refreshStatus]);

  const hasRealProvider = providerStatus.some(
    (row) => row.available && row.id !== "stub",
  );

  return (
    <section className="japanese-study-settings">
      <h3 className="japanese-settings-section-title">Study Assist</h3>
      <p className="japanese-pane-import-hint">
        macOS에서는 Apple Intelligence(on-device)가 기본입니다. 단어 번역은 사전만으로도 동작합니다.
      </p>

      <fieldset className="japanese-study-fieldset">
        <legend>Apple Intelligence</legend>
        <p className="japanese-pane-import-hint">
          최초 1회: <code>cd electron && npm run japanese:build-apple-fm-sidecar</code>
          <br />
          시스템 설정 → Apple Intelligence 활성화 필요 (macOS 26+, Apple Silicon)
        </p>
      </fieldset>

      <div className="japanese-study-provider-status">
        <div className="japanese-study-provider-status-header">
          <span>Provider 상태</span>
          <button type="button" className="ui-btn ui-btn-ghost" onClick={refreshStatus}>
            새로고침
          </button>
        </div>
        <ul className="japanese-study-provider-list">
          {providerStatus.map((row) => (
            <li key={row.id} className={row.available ? "is-available" : "is-unavailable"}>
              {row.available ? "●" : "○"} {row.label}
            </li>
          ))}
        </ul>
        {!hasRealProvider ? (
          <p className="japanese-study-provider-warning">
            Apple Intelligence sidecar가 없거나 비활성입니다. 위 빌드 명령 실행 후 새로고침하세요.
          </p>
        ) : null}
      </div>

      <label className="japanese-study-field">
        <span>Provider</span>
        <select
          value={config.providerId ?? ""}
          onChange={(event) => update({ providerId: event.target.value || undefined })}
        >
          {PROVIDERS.map((provider) => (
            <option key={provider.id || "auto"} value={provider.id}>
              {provider.label}
            </option>
          ))}
        </select>
      </label>

      <label className="japanese-study-field">
        <span>JLPT 힌트</span>
        <select
          value={config.level ?? "auto"}
          onChange={(event) => update({ level: event.target.value as StudyLevel })}
        >
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="japanese-study-fieldset">
        <legend>Ollama</legend>
        <p className="japanese-pane-import-hint">
          터미널: <code>brew install ollama && ollama serve && ollama pull llama3.2</code>
        </p>
        <label className="japanese-study-field">
          <span>Base URL</span>
          <input
            type="text"
            value={config.ollama?.baseUrl ?? ""}
            placeholder="http://127.0.0.1:11434"
            onChange={(event) => update({ ollama: { baseUrl: event.target.value || undefined } })}
          />
        </label>
        <label className="japanese-study-field">
          <span>Model</span>
          <input
            type="text"
            value={config.ollama?.model ?? ""}
            placeholder="비우면 설치된 첫 모델 자동 선택"
            onChange={(event) => update({ ollama: { model: event.target.value || undefined } })}
          />
        </label>
      </fieldset>

      <fieldset className="japanese-study-fieldset">
        <legend>OpenAI-compatible</legend>
        <label className="japanese-study-field">
          <span>Base URL</span>
          <input
            type="text"
            value={config.openaiCompatible?.baseUrl ?? ""}
            placeholder="https://api.openai.com/v1"
            onChange={(event) =>
              update({ openaiCompatible: { baseUrl: event.target.value || undefined } })
            }
          />
        </label>
        <label className="japanese-study-field">
          <span>Model</span>
          <input
            type="text"
            value={config.openaiCompatible?.model ?? ""}
            placeholder="gpt-4o-mini"
            onChange={(event) =>
              update({ openaiCompatible: { model: event.target.value || undefined } })
            }
          />
        </label>
        <label className="japanese-study-field">
          <span>API key</span>
          <input
            type="password"
            value={config.openaiCompatible?.apiKey ?? ""}
            placeholder="sk-..."
            onChange={(event) =>
              update({ openaiCompatible: { apiKey: event.target.value || undefined } })
            }
          />
        </label>
      </fieldset>

      <div className="japanese-study-actions">
        <button type="button" className="ui-btn ui-btn-primary" disabled={saving} onClick={() => void onSave()}>
          {saving ? "저장 중…" : "저장"}
        </button>
        {message ? <span className="japanese-study-message">{message}</span> : null}
      </div>
    </section>
  );
}
