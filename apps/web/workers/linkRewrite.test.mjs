// Run: node --experimental-strip-types apps/web/workers/linkRewrite.test.mjs
import {computeLinkEdits,applyEdits} from "./linkRewrite.ts";
import assert from "node:assert/strict";
const paths=new Set(["a/note.md","!res/Pasted image 1.png","!res/b.png","other/x.md","a/sub/c.md"]);
const run=(content,oldSource,newSource,moves)=>applyEdits(content,computeLinkEdits({content,oldSource,newSource,moves:new Map(Object.entries(moves)),paths}));
// asset moved, other note links by path-wikilink, name wikilink, md link
assert.equal(run("![[!res/b.png]] ![[b.png]] ![](../!res/b.png) ![](%21res/b.png)","other/x.md","other/x.md",{"!res/b.png":"img/b.png"}),
  "![[img/b.png]] ![[b.png]] ![](../img/b.png) ![](img/b.png)");
// rename: name-only links update
assert.equal(run("![[b.png|200]] [[note#h|al]]","other/x.md","other/x.md",{"!res/b.png":"!res/c.png","a/note.md":"a/memo.md"}),"![[c.png|200]] [[memo#h|al]]");
// encoded spaces
assert.equal(run("![x](../!res/Pasted%20image%201.png)","a/note.md","a/note.md",{"!res/Pasted image 1.png":"img/p 1.png"}),"![x](../img/p%201.png)");
// moved note: relative links to unmoved target fixed
assert.equal(run("![](../!res/b.png) [c](sub/c.md)","a/note.md","z/y/note.md",{"a/note.md":"z/y/note.md"}),"![](../../!res/b.png) [c](../../a/sub/c.md)");
// folder move: both move, relative link intact
assert.equal(run("[c](sub/c.md)","a/note.md","q/note.md",{"a/note.md":"q/note.md","a/sub/c.md":"q/sub/c.md"}),"[c](sub/c.md)");
// code fences and urls untouched
assert.equal(run("```\n![[!res/b.png]]\n```\n[w](https://e.com/!res/b.png)","other/x.md","other/x.md",{"!res/b.png":"img/b.png"}),"```\n![[!res/b.png]]\n```\n[w](https://e.com/!res/b.png)");
// --- real-vault formats (.obsidian: wikilinks, newLinkFormat=relative) ---
const vault=new Set(["나/진로.md","나/사업.md","나/osint/osint.md","나/인간관계/관계.md","농사/01 식물은 어떻게 자라는가.md","note/a.md","note/res/img.png","other/b.md"]);
const run2=(content,oldSource,newSource,moves)=>applyEdits(content,computeLinkEdits({content,oldSource,newSource,moves:new Map(Object.entries(moves)),paths:vault}));
// vault-root path links from sibling and nested notes (as found in the vault) follow a moved note
assert.equal(run2("[[나/진로]] [[나/osint]]","나/인간관계/관계.md","나/인간관계/관계.md",{"나/진로.md":"일/진로.md"}),"[[일/진로]] [[나/osint]]");
// name-only link unaffected by a folder move, updated by a rename
assert.equal(run2("[[01 식물은 어떻게 자라는가]]","나/사업.md","나/사업.md",{"농사/01 식물은 어떻게 자라는가.md":"식물/01 식물은 어떻게 자라는가.md"}),"[[01 식물은 어떻게 자라는가]]");
assert.equal(run2("[[01 식물은 어떻게 자라는가|별칭]]","나/사업.md","나/사업.md",{"농사/01 식물은 어떻게 자라는가.md":"농사/식물 1.md"}),"[[식물 1|별칭]]");
// relative embeds: moving the note keeps pointing at note/res/img.png; moving the image updates the relative link
assert.equal(run2("![[res/img.png]] [[../other/b]]","note/a.md","archive/a.md",{"note/a.md":"archive/a.md"}),"![[../note/res/img.png]] [[../other/b]]");
assert.equal(run2("![[res/img.png]]","note/a.md","note/a.md",{"note/res/img.png":"media/img.png"}),"![[../media/img.png]]");
assert.equal(run2("![[./res/img.png]]","note/a.md","note/a.md",{"note/res/img.png":"note/res2/img.png"}),"![[./res2/img.png]]");
console.log("ok");
