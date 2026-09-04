interface Props {
  onBack?: () => void;
}

export function JapaneseDetailNav({ onBack }: Props) {
  if (!onBack) return null;
  return (
    <div className="japanese-detail-nav">
      <button type="button" className="japanese-detail-nav-back" onClick={onBack} aria-label="뒤로">
        <svg className="japanese-detail-nav-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M10 3.5 5.5 8 10 12.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
