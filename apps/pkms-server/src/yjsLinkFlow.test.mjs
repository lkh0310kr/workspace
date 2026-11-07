// Run: node --experimental-strip-types apps/pkms-server/src/yjsLinkFlow.test.mjs
// Mirrors the server flow: seeded Yjs state + link edit update must reproduce the edited text.
import * as Y from "yjs";
import assert from "node:assert/strict";
import { computeLinkEdits } from "./linkRewrite.ts";
const content = "# T\n![[!res/b.png]] and ![](../!res/b.png)\n한글 ✓\n";
const seed = new Y.Doc(); seed.getText("markdown").insert(0, content);
const state = Y.encodeStateAsUpdate(seed);                       // what pkms_mirror_content stores
const doc = new Y.Doc(); Y.applyUpdate(doc, state);              // what the server loads
const text = doc.getText("markdown");
const edits = computeLinkEdits({ content: text.toString(), oldSource: "a/n.md", newSource: "a/n.md",
  moves: new Map([["!res/b.png", "img/b.png"]]), paths: new Set(["a/n.md", "!res/b.png"]) });
assert.equal(edits.length, 2);
const vector = Y.encodeStateVector(doc);
doc.transact(() => { for (const e of [...edits].sort((a, b) => b.start - a.start)) { text.delete(e.start, e.end - e.start); if (e.text) text.insert(e.start, e.text); } });
const update = Y.encodeStateAsUpdate(doc, vector);
const server = new Y.Doc(); Y.applyUpdate(server, state); Y.applyUpdate(server, update);   // state + appended update
assert.equal(server.getText("markdown").toString(), "# T\n![[img/b.png]] and ![](../img/b.png)\n한글 ✓\n");
console.log("ok");
