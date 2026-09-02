import { useEffect } from "react";

interface Props {
  previewText: string;
  loading: boolean;
  error: string | null;
  onAccept: () => void;
  onDiscard: () => void;
}

export function DocumentAugmentPreviewPanel({
  previewText,
  loading,
  error,
  onAccept,
  onDiscard,
}: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDiscard();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (!loading && previewText.trim()) onAccept();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [loading, onAccept, onDiscard, previewText]);

  return (
    <div className="document-augment-preview">
      <div className="document-augment-preview-header">
        <span className="document-augment-preview-title">문서 증강 미리보기</span>
        <div className="document-augment-preview-actions">
          <button type="button" className="document-augment-preview-discard" onClick={onDiscard}>
            취소
          </button>
          <button
            type="button"
            className="document-augment-preview-accept"
            onClick={onAccept}
            disabled={loading || !previewText.trim()}
          >
            삽입
          </button>
        </div>
      </div>
      <div className="document-augment-preview-body">
        {loading ? (
          <div className="document-augment-preview-status">문서 보강 중…</div>
        ) : error ? (
          <div className="document-augment-preview-error">{error}</div>
        ) : (
          <pre className="document-augment-preview-text">{previewText || "생성된 내용이 없습니다."}</pre>
        )}
      </div>
    </div>
  );
}
