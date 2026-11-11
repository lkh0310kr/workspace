import { useState, type FormEvent } from "react";
import type { EditorView } from "@codemirror/view";

type PropertyType = "text" | "date" | "number" | "checkbox" | "list";
interface PropertyRow { line: number; endLine: number; key: string; value: string | string[]; type: PropertyType }

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
    const match = doc.line(number).text.match(/^([\w.-]+):(?:\s+(.*))?\s*$/);
    if (!match) continue;
    const key = match[1];
    const raw = (match[2] ?? "").trim();
    const listLines: string[] = [];
    let endLine = number;
    if (!raw) {
      for (let child = number + 1; child < closeLine; child++) {
        const item = doc.line(child).text.match(/^\s+-\s*(.*)$/);
        if (!item) break;
        listLines.push(unquote(item[1]));
        endLine = child;
      }
      // Nested mappings/objects are preserved in source and are not flattened into a lossy field.
      if (endLine === number && number + 1 < closeLine && /^\s+\S/.test(doc.line(number + 1).text)) continue;
    }
    if (listLines.length) {
      rows.push({ line: number, endLine, key, value: listLines, type: "list" });
      number = endLine;
      continue;
    }
    if (/^\[.*\]$/.test(raw)) {
      const values = raw.slice(1, -1).split(/,(?=(?:[^']*'[^']*')*[^']*$)/).map((item) => unquote(item.trim())).filter(Boolean);
      rows.push({ line: number, endLine, key, value: values, type: "list" });
    } else if (/^(?:true|false)$/i.test(raw)) {
      rows.push({ line: number, endLine, key, value: raw.toLowerCase(), type: "checkbox" });
    } else if (/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) {
      rows.push({ line: number, endLine, key, value: raw, type: "number" });
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      rows.push({ line: number, endLine, key, value: raw, type: "date" });
    } else if (/^(?:null|~)$/i.test(raw) || /^[|>&*!?{]/.test(raw)) {
      continue;
    } else {
      rows.push({ line: number, endLine, key, value: unquote(raw), type: "text" });
    }
  }
  return { rows, closeLine };
}

function unquote(value: string): string {
  if (value.startsWith("\"") && value.endsWith("\"")) {
    try { return JSON.parse(value); } catch { return value.slice(1, -1); }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  return value;
}

function serializeText(value: string): string { return JSON.stringify(value); }

function TypeIcon({ type }: { type: PropertyType }) {
  if (type === "date") return <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="1.5" /><path d="M5 2v3M11 2v3M2 6h12" /></svg>;
  if (type === "list") return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 4h9M5 8h9M5 12h9" /><circle cx="2" cy="4" r=".6" /><circle cx="2" cy="8" r=".6" /><circle cx="2" cy="12" r=".6" /></svg>;
  if (type === "checkbox") return <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2" /><path d="m4.5 8 2.2 2.2L12 5" /></svg>;
  if (type === "number") return <span aria-hidden="true">#</span>;
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h8" /></svg>;
}

export function EditorMarkdownProperties({ view, revision }: { view: EditorView | null; revision: number }) {
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newType, setNewType] = useState<PropertyType>("text");
  if (!view) return null;
  void revision;
  const { rows, closeLine } = readProperties(view);

  const replaceRow = (row: PropertyRow, key: string, value: string | string[]) => {
    const doc = view.state.doc;
    const first = doc.line(row.line);
    const last = doc.line(row.endLine);
    const serialized = row.type === "list"
      ? `${key}:\n${(Array.isArray(value) ? value : value.split(",").map((item) => item.trim()).filter(Boolean)).map((item) => `  - ${serializeText(item)}`).join("\n")}`
      : `${key}: ${row.type === "text" ? serializeText(String(value)) : value}`;
    view.dispatch({ changes: { from: first.from, to: last.to, insert: serialized } });
  };

  const removeRow = (row: PropertyRow) => {
    const doc = view.state.doc;
    const first = doc.line(row.line);
    const last = doc.line(row.endLine);
    view.dispatch({ changes: { from: first.from > 0 ? first.from - 1 : first.from, to: last.to } });
  };

  const addProperty = (event: FormEvent) => {
    event.preventDefault();
    const key = newKey.trim();
    if (!key || !/^[\w.-]+$/.test(key) || rows.some((row) => row.key === key)) return;
    const initial = newType === "checkbox" ? "false" : newType === "list" ? `${key}:\n  - ""` : newType === "text" ? `${key}: ""` : `${key}: `;
    const doc = view.state.doc;
    const insert = `${initial}\n`;
    if (closeLine !== null) view.dispatch({ changes: { from: doc.line(closeLine).from, insert } });
    else view.dispatch({ changes: { from: 0, insert: `---\n${insert}---\n` } });
    setNewKey(""); setAdding(false);
  };

  return (
    <section className="editor-markdown-properties" aria-label="Document properties">
      {rows.length > 0 && <h2 className="editor-properties-heading">Properties</h2>}
      <div className="editor-properties-list">
        {rows.map((row) => (
          <div className={`editor-property-row is-${row.type}`} key={row.line}>
            <span className="editor-property-type"><TypeIcon type={row.type} /></span>
            <input className="editor-property-name" aria-label={`Property name: ${row.key}`} value={row.key} disabled={view.state.readOnly} onChange={(event) => replaceRow(row, event.target.value, row.value)} />
            {row.type === "checkbox" ? (
              <label className="editor-property-value editor-property-checkbox"><input type="checkbox" checked={row.value === "true"} disabled={view.state.readOnly} onChange={(event) => replaceRow(row, row.key, String(event.target.checked))} /><span>{row.value === "true" ? "Checked" : "Unchecked"}</span></label>
            ) : row.type === "list" ? (
              <input className="editor-property-value" aria-label={`Property value: ${row.key}`} value={(row.value as string[]).join(", ")} disabled={view.state.readOnly} onChange={(event) => replaceRow(row, row.key, event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} />
            ) : (
              <input className="editor-property-value" aria-label={`Property value: ${row.key}`} type={row.type === "date" ? "date" : row.type === "number" ? "number" : "text"} value={String(row.value)} disabled={view.state.readOnly} onChange={(event) => replaceRow(row, row.key, event.target.value)} />
            )}
            <button className="editor-property-remove" type="button" aria-label={`Remove property: ${row.key}`} disabled={view.state.readOnly} onClick={() => removeRow(row)}>×</button>
          </div>
        ))}
      </div>
      {adding ? (
        <form className="editor-property-add-form" onSubmit={addProperty}>
          <TypeIcon type={newType} />
          <input autoFocus aria-label="New property name" placeholder="Property name" value={newKey} onChange={(event) => setNewKey(event.target.value)} />
          <select aria-label="Property type" value={newType} onChange={(event) => setNewType(event.target.value as PropertyType)}>
            <option value="text">Text</option><option value="date">Date</option><option value="number">Number</option><option value="checkbox">Checkbox</option><option value="list">List</option>
          </select>
          <button type="submit">Add</button>
          <button type="button" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      ) : <button className="editor-property-add" type="button" disabled={view.state.readOnly} onClick={() => setAdding(true)}>+ Add property</button>}
    </section>
  );
}
