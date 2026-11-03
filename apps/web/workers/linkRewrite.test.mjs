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
console.log("ok");
