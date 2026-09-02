import { EditorView, keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type { AnchorRect } from "./components/Popover";
import type { SlashCommandActiveState } from "./markdownSlashCommands";

export type SlashCommandKeyboardHost = {
  selectedIndex: number;
  resetSelection: () => void;
  moveSelection: (delta: number, max: number) => void;
  onExecute: () => void;
  onClose: () => void;
};

function detectSlashAtCursor(view: EditorView): { slashFrom: number; slashTo: number; query: string } | null {
  const { head, empty } = view.state.selection.main;
  if (!empty) return null;

  const line = view.state.doc.lineAt(head);
  const beforeCursor = line.text.slice(0, head - line.from);
  const match = beforeCursor.match(/(^|\s)\/([^\s]*)$/);
  if (!match) return null;

  const query = match[2] ?? "";
  const slashFrom = head - query.length - 1;
  return { slashFrom, slashTo: head, query };
}

function coordsToAnchorRect(coords: { left: number; top: number; right: number; bottom: number }): AnchorRect {
  return {
    left: coords.left,
    top: coords.top,
    right: coords.right,
    bottom: coords.bottom,
    width: coords.right - coords.left,
    height: coords.bottom - coords.top,
  };
}

export function createMarkdownSlashCommandExtension(options: {
  onStateChange: (state: SlashCommandActiveState | null) => void;
  keyboardHost: SlashCommandKeyboardHost;
  isActive: () => boolean;
}): Extension {
  const publish = (view: EditorView): void => {
    if (!options.isActive()) {
      options.onStateChange(null);
      return;
    }

    const detected = detectSlashAtCursor(view);
    if (!detected) {
      options.onStateChange(null);
      return;
    }

    const coords = view.coordsAtPos(detected.slashTo, 1) ?? view.coordsAtPos(detected.slashTo);
    if (!coords) {
      options.onStateChange(null);
      return;
    }

    options.keyboardHost.resetSelection();
    options.onStateChange({
      query: detected.query,
      slashFrom: detected.slashFrom,
      slashTo: detected.slashTo,
      anchorRect: coordsToAnchorRect(coords),
    });
  };

  return [
    EditorView.updateListener.of((update) => {
      if (update.docChanged || update.selectionSet) {
        publish(update.view);
      }
    }),
    keymap.of([
      {
        key: "ArrowUp",
        run: (view) => {
          if (!options.isActive() || !detectSlashAtCursor(view)) return false;
          options.keyboardHost.moveSelection(-1, Number.POSITIVE_INFINITY);
          return true;
        },
      },
      {
        key: "ArrowDown",
        run: (view) => {
          if (!options.isActive() || !detectSlashAtCursor(view)) return false;
          options.keyboardHost.moveSelection(1, Number.POSITIVE_INFINITY);
          return true;
        },
      },
      {
        key: "Enter",
        run: (view) => {
          if (!options.isActive() || !detectSlashAtCursor(view)) return false;
          options.keyboardHost.onExecute();
          return true;
        },
      },
      {
        key: "Escape",
        run: (view) => {
          if (!options.isActive() || !detectSlashAtCursor(view)) return false;
          options.keyboardHost.onClose();
          return true;
        },
      },
    ]),
  ];
}
