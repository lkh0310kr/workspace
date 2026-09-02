import { createPortal } from "react-dom";
import { DictionarySetup } from "./DictionarySetup";
import { JapaneseStudySettings } from "./JapaneseStudySettings";

interface Props {
  onClose: () => void;
}

export function JapaneseSettingsDialog({ onClose }: Props) {
  return createPortal(
    <div className="japanese-settings-backdrop" onClick={onClose}>
      <div
        className="japanese-settings-dialog"
        role="dialog"
        aria-label="일본어 사전 설정"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="japanese-settings-header">
          <h2 className="japanese-settings-title">일본어 사전 설정</h2>
          <button type="button" className="ui-btn ui-btn-ghost" onClick={onClose}>
            닫기
          </button>
        </header>
        <div className="japanese-settings-body">
          <DictionarySetup />
          <JapaneseStudySettings />
        </div>
      </div>
    </div>,
    document.body,
  );
}
