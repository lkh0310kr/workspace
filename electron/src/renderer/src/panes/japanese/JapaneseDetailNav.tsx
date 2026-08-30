interface Props {
  label: string;
  onBack?: () => void;
}

export function JapaneseDetailNav({ label, onBack }: Props) {
  if (!onBack) return null;
  return (
    <div className="japanese-detail-nav">
      <button type="button" className="ui-btn ui-btn-ghost japanese-detail-nav-back" onClick={onBack}>
        ← 뒤로
      </button>
      <span className="japanese-detail-nav-label">{label}</span>
    </div>
  );
}
