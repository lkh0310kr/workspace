export interface EditorOutlineEntry {
  id: string;
  level: number;
  label: string;
  position: number;
}

export interface EditorOutlineListProps {
  items: readonly EditorOutlineEntry[];
  onNavigate: (position: number) => void;
  emptyMessage?: string;
  className?: string;
  itemClassName?: string;
  indentSize?: number;
}

/** Shared heading hierarchy and navigation list for Markdown editors. */
export function EditorOutlineList({
  items,
  onNavigate,
  emptyMessage = "No headings",
  className,
  itemClassName,
  indentSize = 12,
}: EditorOutlineListProps) {
  if (items.length === 0) return <div className={className}>{emptyMessage}</div>;
  return (
    <nav className={className} aria-label="Document outline">
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          className={itemClassName}
          style={{ paddingInlineStart: 8 + Math.max(0, item.level - 1) * indentSize }}
          title={item.label}
          onClick={() => onNavigate(item.position)}
        >
          {item.label || "(empty heading)"}
        </button>
      ))}
    </nav>
  );
}
