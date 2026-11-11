import { useState, type FormEvent } from "react";
import { isMap, isScalar, isSeq, parseDocument, stringify, type Pair, type Scalar, type YAMLSeq } from "yaml";
import type { EditorView } from "@codemirror/view";

type PropertyType = "text" | "date" | "number" | "checkbox" | "list" | "complex";
interface PropertyRow { key: string; value: string | string[]; type: PropertyType; keyFrom: number; keyTo: number; valueFrom: number; valueTo: number; line: number }
interface Frontmatter { rows: PropertyRow[]; bodyFrom: number | null }

function readFrontmatter(view: EditorView): Frontmatter {
  const doc = view.state.doc;
  if (doc.lines < 2 || doc.line(1).text.trim() !== "---") return { rows: [], bodyFrom: null };
  let closeLine = 0;
  for (let n = 2; n <= doc.lines; n++) if (/^(---|\.\.\.)\s*$/.test(doc.line(n).text)) { closeLine = n; break; }
  if (!closeLine) return { rows: [], bodyFrom: null };
  const first = doc.line(2).from;
  const closing = doc.line(closeLine);
  const source = doc.sliceString(first, closing.from);
  const parsed = parseDocument(source, { uniqueKeys: false, prettyErrors: false });
  if (parsed.errors.length || (parsed.contents && !isMap(parsed.contents))) return { rows: [], bodyFrom: closing.from };
  const rows: PropertyRow[] = [];
  for (const pair of (parsed.contents && isMap(parsed.contents) ? parsed.contents.items : []) as Pair[]) {
    const keyNode = pair.key as Scalar;
    const node = pair.value as Scalar | YAMLSeq | null;
    if (!isScalar(keyNode) || typeof keyNode.value !== "string" || !keyNode.range || !node?.range) continue;
    const key = keyNode.value;
    const keyFrom = first + keyNode.range[0];
    const keyTo = first + keyNode.range[1];
    const valueFrom = first + node.range[0];
    const valueTo = first + node.range[1];
    let value: string | string[];
    let type: PropertyType;
    if (isSeq(node) && node.items.every((item) => isScalar(item) && (item.value == null || ["string", "number", "boolean"].includes(typeof item.value)))) {
      value = node.items.map((item) => String(isScalar(item) ? item.value ?? "" : "")); type = "list";
    } else if (isScalar(node)) {
      const raw = node.value;
      if (typeof raw === "boolean") { value = String(raw); type = "checkbox"; }
      else if (typeof raw === "number") { value = String(raw); type = "number"; }
      else if (raw instanceof Date) { value = raw.toISOString().slice(0, 10); type = "date"; }
      else if (raw == null) { value = ""; type = "text"; }
      else { value = String(raw); type = "text"; }
    } else { value = "Structured value"; type = "complex"; }
    rows.push({ key, value, type, keyFrom, keyTo, valueFrom, valueTo, line: doc.lineAt(keyFrom).number });
  }
  return { rows, bodyFrom: closing.from };
}

function TypeIcon({ type }: { type: PropertyType }) {
  if (type === "date") return <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="1.5" /><path d="M5 2v3M11 2v3M2 6h12" /></svg>;
  if (type === "list") return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 4h9M5 8h9M5 12h9" /><circle cx="2" cy="4" r=".6" /><circle cx="2" cy="8" r=".6" /><circle cx="2" cy="12" r=".6" /></svg>;
  if (type === "checkbox") return <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2" /><path d="m4.5 8 2.2 2.2L12 5" /></svg>;
  if (type === "number") return <span aria-hidden="true">#</span>;
  if (type === "complex") return <span aria-hidden="true">{`{}`}</span>;
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h8" /></svg>;
}

export function EditorMarkdownProperties({ view, revision }: { view: EditorView | null; revision: number }) {
  const [adding, setAdding] = useState(false); const [newKey, setNewKey] = useState(""); const [newType, setNewType] = useState<PropertyType>("text");
  if (!view) return null;
  void revision;
  const frontmatter = readFrontmatter(view); const { rows } = frontmatter;
  const replaceRange = (from: number, to: number, insert: string) => view.dispatch({ changes: { from, to, insert } });
  const replaceValue = (row: PropertyRow, value: string | string[]) => {
    let serialized: string;
    if (row.type === "list") serialized = stringify((Array.isArray(value) ? value : [value]).filter(Boolean).map((v) => String(v)), { collectionStyle: "flow" }).trimEnd();
    else if (row.type === "text") serialized = stringify(String(value)).trimEnd();
    else serialized = String(value);
    replaceRange(row.valueFrom, row.valueTo, serialized);
  };
  const addProperty = (event: FormEvent) => {
    event.preventDefault(); const key = newKey.trim();
    if (!key || rows.some((row) => row.key === key) || frontmatter.bodyFrom == null) return;
    const initial: Record<PropertyType, unknown> = { text: "", date: "", number: 0, checkbox: false, list: [], complex: {} };
    const serialized = `${stringify(key).trimEnd()}: ${stringify(initial[newType]).trimEnd()}\n`;
    const close = view.state.doc.lineAt(frontmatter.bodyFrom);
    replaceRange(close.from, close.from, serialized);
    setNewKey(""); setAdding(false);
  };
  const createFirstProperty = (event: FormEvent) => {
    if (frontmatter.bodyFrom !== null) { addProperty(event); return; }
    event.preventDefault(); const key = newKey.trim();
    if (!key || !/^[\w.-]+$/.test(key)) return;
    const initial: Record<PropertyType, unknown> = { text: "", date: "", number: 0, checkbox: false, list: [], complex: {} };
    const yaml = `${stringify(key).trimEnd()}: ${stringify(initial[newType]).trimEnd()}\n`;
    view.dispatch({ changes: { from: 0, insert: `---\n${yaml}---\n` } }); setNewKey(""); setAdding(false);
  };
  const add = frontmatter.bodyFrom === null ? createFirstProperty : addProperty;

  return <section className="editor-markdown-properties" aria-label="Document properties">
    <h2 className="editor-properties-heading">Properties</h2>
    <div className="editor-properties-list">{rows.map((row) => <div className={`editor-property-row is-${row.type}`} key={`${row.key}-${row.line}`}>
      <span className="editor-property-type"><TypeIcon type={row.type} /></span>
      <input className="editor-property-name" aria-label={`Property name: ${row.key}`} value={row.key} disabled={view.state.readOnly || row.type === "complex"} onChange={(e) => replaceRange(row.keyFrom, row.keyTo, stringify(e.target.value).trimEnd())} />
      {row.type === "checkbox" ? <label className="editor-property-value editor-property-checkbox"><input type="checkbox" checked={row.value === "true"} disabled={view.state.readOnly} onChange={(e) => replaceValue(row, String(e.target.checked))} /><span>{row.value === "true" ? "Checked" : "Unchecked"}</span></label>
        : row.type === "complex" ? <span className="editor-property-value editor-property-structured">{row.value}</span>
        : row.type === "list" ? <input className="editor-property-value" aria-label={`Property value: ${row.key}`} value={(row.value as string[]).join(", ")} disabled={view.state.readOnly} onChange={(e) => replaceValue(row, e.target.value.split(",").map((item) => item.trim()).filter(Boolean))} />
        : <input className="editor-property-value" aria-label={`Property value: ${row.key}`} type={row.type === "date" ? "date" : row.type === "number" ? "number" : "text"} value={String(row.value)} disabled={view.state.readOnly} onChange={(e) => replaceValue(row, e.target.value)} />}
      <button className="editor-property-remove" type="button" aria-label={`Remove property: ${row.key}`} disabled={view.state.readOnly} onClick={() => { const from = view.state.doc.line(row.line).from; const to = view.state.doc.lineAt(row.valueTo).to; replaceRange(from > 0 ? from - 1 : from, to, ""); }}>×</button>
    </div>)}</div>
    {adding ? <form className="editor-property-add-form" onSubmit={add}>
      <TypeIcon type={newType} /><input autoFocus aria-label="New property name" placeholder="Property name" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
      <select aria-label="Property type" value={newType} onChange={(e) => setNewType(e.target.value as PropertyType)}><option value="text">Text</option><option value="date">Date</option><option value="number">Number</option><option value="checkbox">Checkbox</option><option value="list">List</option></select>
      <button type="submit">Add</button><button type="button" onClick={() => setAdding(false)}>Cancel</button>
    </form> : <button className="editor-property-add" type="button" disabled={view.state.readOnly} onClick={() => setAdding(true)}>+ Add property</button>}
  </section>;
}
