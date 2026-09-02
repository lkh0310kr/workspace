import { useEffect, useMemo } from "react";
import { Popover, type AnchorRect } from "./components/Popover";
import {
  filterSlashCommands,
  slashCommandDisplayLabel,
  type SlashCommandDef,
} from "./markdownSlashCommands";

interface Props {
  anchorRect: AnchorRect;
  query: string;
  selectedIndex: number;
  commands: SlashCommandDef[];
  onSelect: (command: SlashCommandDef) => void;
  onClose: () => void;
  onSelectedIndexChange: (index: number) => void;
}

export function MarkdownSlashCommandPopover({
  anchorRect,
  query,
  selectedIndex,
  commands,
  onSelect,
  onClose,
  onSelectedIndexChange,
}: Props) {
  const filtered = useMemo(() => filterSlashCommands(query, commands), [commands, query]);

  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      onSelectedIndexChange(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, onSelectedIndexChange, selectedIndex]);

  return (
    <Popover anchorRect={anchorRect} onClose={onClose} className="markdown-slash-popover">
      {filtered.length === 0 ? (
        <div className="markdown-slash-empty">일치하는 명령이 없습니다</div>
      ) : (
        <div className="markdown-slash-list" role="listbox">
          {filtered.map((command, index) => (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              className={`markdown-slash-item${index === selectedIndex ? " active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onSelectedIndexChange(index)}
              onClick={() => onSelect(command)}
            >
              <span className="markdown-slash-item-label">{slashCommandDisplayLabel(command)}</span>
              <span className="markdown-slash-item-desc">{command.description}</span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
