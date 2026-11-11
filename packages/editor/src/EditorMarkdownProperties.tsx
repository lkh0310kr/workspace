import { useState, type FormEvent } from "react";
import type { EditorView } from "@codemirror/view";

interface PropertyRow { line: number; key: string; value: string }

function readProperties(view: EditorView): { rows: PropertyRow[]; closeLine: number | null } {
  const doc = view.state.doc;
  if (doc.lines < 2 || doc.line(1).text.trim() !== "---") return { rows: [], closeLine: null };
  let closeLine: number | null = null;
  for (let number = 2; number <= doc.lines; number++) {
    if (/^(---|\.\.\.)\s*$/.test(doc.line(number).text)) { closeLine = number; break; }
  }
  if (closeLine === null) return { rows: [], closeLine: null };
  const rows: PropertyRow[] = [];
  for (let number = 2; number < closeLine; number++) {
    const raw = doc.line(number).text;
    const match = raw.match(/^([\w.-]+):\s*(.*)$/);
    if (!match) continue;
    const rawValue = match[2];
    const quoted = /^(?:".*"|'.*')$/.test(rawValue);
    if (!quoted && (/^(?:true|false|null|~)$/i.test(rawValue) || /^[-+]?(?:\d|\.\d)/.test(rawValue) || /^[\[{|>&*!]/.test(rawValue))) continue;
    rows.push({ line: number, key: match[1], value: rawValue.replace(/^(?:"(.*)"|'(.*)')$/, (_, double, single) => double ?? single) });
  }
  return { rows, closeLine };
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

export function EditorMarkdownProperties({ view, revision }: { view: EditorView | null; revision: number }) {
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  if (!view) return null;
  void revision;
  const { rows, closeLine } = readProperties(view);
  const replaceRow = (row: PropertyRow, key: string, value: string) => {
    view.dispatch({ changes: { from: view.state.doc.line(row.line).from, to: view.state.doc.line(row.line).to, insert: `${key}: ${yamlScalar(value)}` } });
  };
  const removeRow = (row: PropertyRow) => {
    const line = view.state.doc.line(row.line);
    const from = line.from > 0 ? line.from - 1 : line.from;
    view.dispatch({ changes: { from, to: line.to } });
  };
  const addProperty = (event: FormEvent) => {
    event.preventDefault();
    const key = newKey.trim();
    if (!key || !/^[\w.-]+$/.test(key) || rows.some((row) => row.key === key)) return;
    const doc = view.state.doc;
    if (closeLine !== null) {
      const close = doc.line(closeLine);
      view.dispatch({ changes: { from: close.from, insert: `${key}: ${yamlScalar(newValue)}\n` } });
    } else {
      view.dispatch({ changes: { from: 0, insert: `---\n${key}: ${yamlScalar(newValue)}\n---\n` } });
    }
    setNewKey(""); setNewValue(""); setAdding(false);
  };
  return (
    <section className="editor-markdown-properties" aria-label="Document properties">
      {rows.map((row) => (
        <div className="editor-property-row" key={row.line}>
          <input aria-label={`Property name: ${row.key}`} value={row.key} disabled={view.state.readOnly} onChange={(event) => replaceRow(row, event.target.value, row.value)} />
          <input aria-label={`Property value: ${row.key}`} value={row.value} disabled={view.state.readOnly} onChange={(event) => replaceRow(row, row.key, event.target.value)} />
          <button type="button" aria-label={`Remove property: ${row.key}`} disabled={view.state.readOnly} onClick={() => removeRow(row)}>×</button>
        </div>
      ))}
      {adding ? (
        <form className="editor-property-add-form" onSubmit={addProperty}>
          <input autoFocus aria-label="New property name" placeholder="Property" value={newKey} onChange={(event) => setNewKey(event.target.value)} />
          <input aria-label="New property value" placeholder="Value" value={newValue} onChange={(event) => setNewValue(event.target.value)} />
          <button type="submit">Add</button>
          <button type="button" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      ) : <button className="editor-property-add" type="button" disabled={view.state.readOnly} onClick={() => setAdding(true)}>+ Add property</button>}
    </section>
  );
}
