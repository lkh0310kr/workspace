interface Props {
  active?: boolean;
  onClick: () => void;
}

/** Shared editor toolbar action for opening the in-document Find/Replace panel. */
export function EditorSearchButton({ active = false, onClick }: Props) {
  return <button type="button" className={`obsidian-topbar-icon${active ? " active" : ""}`} title="Search" aria-label="Search in document" onClick={onClick}>
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85Zm-5.242 1.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" /></svg>
  </button>;
}
