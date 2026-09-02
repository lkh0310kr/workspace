import { useCallback, useEffect, useState } from "react";
import type { JapaneseStudyConfig, StudyLevel } from "../../../../shared/japaneseStudyTypes";
import {
  getJapaneseStudyConfig,
  getJapaneseStudyProviderStatus,
  japaneseStudyAssist,
  saveJapaneseStudyConfig,
  type StudyProviderStatus,
} from "../../electron";
import { GPT4O_MINI_DEFAULTS } from "../../../../shared/japaneseStudyDefaults";

const PROVIDERS = [
  { id: "", label: "자동 (API 키 있으면 OpenAI 우선)" },
  { id: "openai-compatible", label: "OpenAI (GPT-4o mini)" },
  { id: "ollama", label: "Ollama (로컬)" },
  { id: "apple-fm", label: "Apple Intelligence (on-device)" },
  { id: "stub", label: "Stub (테스트용)" },
] as const;

const LEVELS: StudyLevel[] = ["auto", "N5", "N4", "N3"];

export function JapaneseStudySettings() {
  const [config, setConfig] = useState<JapaneseStudyConfig>({});
  const [providerStatus, setProviderStatus] = useState<StudyProviderStatus[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
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

  const applyGpt4oMiniPreset = useCallback(() => {
    update({
      providerId: "openai-compatible",
      openaiCompatible: {
        baseUrl: GPT4O_MINI_DEFAULTS.baseUrl,
        model: GPT4O_MINI_DEFAULTS.model,
      },
    });
    setMessage("GPT-4o mini 프리셋을 적용했습니다. API key를 입력한 뒤 저장하세요.");
  }, [update]);

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

  const onTestConnection = useCallback(async () => {
    setTesting(true);
    setMessage(null);
    try {
      await saveJapaneseStudyConfig(config);
      refreshStatus();
      const result = await japaneseStudyAssist({
        task: "grammar_hint",
        text: "は",
      });
      const reply = (result.note ?? result.lines.join("\n")).trim();
      if (!reply) {
        throw new Error("응답이 비어 있습니다.");
      }
      setMessage(`연결 OK (${result.providerId}): ${truncate(reply, 80)}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }, [config, refreshStatus]);

  const hasRealProvider = providerStatus.some(
    (row) => row.available && row.id !== "stub",
  );

  return (
    <section className="japanese-study-settings">
      <h3 className="japanese-settings-section-title">Study Assist</h3>
      <p className="japanese-pane-import-hint">
        권장: <strong>OpenAI GPT-4o mini</strong>. 에디터에서 텍스트 선택 → Study 채팅으로 일본어 튜터와 대화합니다.
      </p>

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
            사용 가능한 LLM이 없습니다. 아래 OpenAI API key를 입력하고 저장하세요.
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
        <legend>OpenAI (GPT-4o mini)</legend>
        <p className="japanese-pane-import-hint">
          API key는 앱 설정에 저장됩니다 (<code>config.electron.json</code> →{" "}
          <code>japaneseStudy.openaiCompatible.apiKey</code>). 환경 변수{" "}
          <code>OPENAI_API_KEY</code>도 사용할 수 있습니다.
        </p>
        <div className="japanese-study-actions">
          <button type="button" className="ui-btn ui-btn-ghost" onClick={applyGpt4oMiniPreset}>
            GPT-4o mini 프리셋
          </button>
        </div>
        <label className="japanese-study-field">
          <span>Base URL</span>
          <input
            type="text"
            value={config.openaiCompatible?.baseUrl ?? GPT4O_MINI_DEFAULTS.baseUrl}
            placeholder={GPT4O_MINI_DEFAULTS.baseUrl}
            onChange={(event) =>
              update({ openaiCompatible: { baseUrl: event.target.value || undefined } })
            }
          />
        </label>
        <label className="japanese-study-field">
          <span>Model</span>
          <input
            type="text"
            value={config.openaiCompatible?.model ?? GPT4O_MINI_DEFAULTS.model}
            placeholder={GPT4O_MINI_DEFAULTS.model}
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
            autoComplete="off"
            onChange={(event) =>
              update({ openaiCompatible: { apiKey: event.target.value || undefined } })
            }
          />
        </label>
      </fieldset>

      <fieldset className="japanese-study-fieldset">
        <legend>Ollama</legend>
        <p className="japanese-pane-import-hint">
          터미널: <code>brew install ollama && ollama serve && ollama pull qwen2.5</code>
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
        <legend>Apple Intelligence</legend>
        <p className="japanese-pane-import-hint">
          최초 1회: <code>cd electron && npm run japanese:build-apple-fm-sidecar</code>
          <br />
          macOS 26+, Apple Silicon, 시스템 설정에서 Apple Intelligence 활성화
        </p>
      </fieldset>

      <div className="japanese-study-actions">
        <button type="button" className="ui-btn ui-btn-primary" disabled={saving} onClick={() => void onSave()}>
          {saving ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-ghost"
          disabled={testing || saving}
          onClick={() => void onTestConnection()}
        >
          {testing ? "테스트 중…" : "연결 테스트"}
        </button>
        {message ? <span className="japanese-study-message">{message}</span> : null}
      </div>
    </section>
  );
}

function truncate(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
