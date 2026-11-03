// Obsidian-style link maintenance: when files move or are renamed, compute the text edits that keep
// [[wikilinks]], ![[embeds]], [text](path) and ![alt](path) pointing at the same files.

export type TextEdit = { start: number; end: number; text: string };

export interface LinkRewriteInput {
  content: string;
  /** Path of the note containing the links, before and after the operation. */
  oldSource: string;
  newSource: string;
  /** Moved files only (old path -> new path); folders are expanded by the caller. */
  moves: ReadonlyMap<string, string>;
  /** Every file path in the workspace before the operation. */
  paths: ReadonlySet<string>;
}

const dirname = (path: string) => { const i = path.lastIndexOf("/"); return i < 0 ? "" : path.slice(0, i); };
const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const stripMd = (name: string) => name.replace(/\.md$/i, "");

function normalize(path: string): string | null {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!out.length) return null; out.pop(); } else out.push(part);
  }
  return out.join("/");
}

function relativePath(fromDir: string, to: string): string {
  const from = fromDir ? fromDir.split("/") : [];
  const target = to.split("/");
  let common = 0;
  while (common < from.length && common < target.length - 1 && from[common] === target[common]) common++;
  return [...Array(from.length - common).fill(".."), ...target.slice(common)].join("/");
}

function fencedRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const fence = /^[ \t]*(```|~~~)/gm;
  let open: number | null = null;
  for (let match = fence.exec(content); match; match = fence.exec(content)) {
    if (open === null) open = match.index;
    else { ranges.push([open, match.index + match[0].length]); open = null; }
  }
  if (open !== null) ranges.push([open, content.length]);
  return ranges;
}

function safeDecode(value: string): string {
  try { return decodeURI(value); } catch { return value; }
}

function encodeLike(original: string, path: string): string {
  const encoded = /%[0-9a-f]{2}/i.test(original);
  return encoded ? path.split("/").map(encodeURIComponent).join("/") : path.replaceAll(" ", "%20");
}

export function computeLinkEdits(input: LinkRewriteInput): TextEdit[] {
  const { content, oldSource, newSource, moves, paths } = input;
  if (!moves.size && oldSource === newSource) return [];
  const fences = fencedRanges(content);
  const inFence = (index: number) => fences.some(([start, end]) => index >= start && index < end);
  const edits: TextEdit[] = [];

  const byName = new Map<string, string[]>();
  for (const path of paths) {
    const key = stripMd(basename(path)).toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), path]);
  }

  const oldDir = dirname(oldSource);
  const newDir = dirname(newSource);
  const wikilink = /(!?)\[\[([^\]\n|#]+)(#[^\]\n|]*)?(\|[^\]\n]*)?\]\]/dg;
  for (let match = wikilink.exec(content); match; match = wikilink.exec(content)) {
    if (inFence(match.index)) continue;
    const raw = match[2];
    const target = raw.trim();
    const [start, end] = match.indices![2];
    const hadMd = /\.md$/i.test(target);
    let resolved: string | undefined;
    let relativeStyle = false;
    if (target.includes("/")) {
      // Obsidian tries the path relative to the note first, then from the vault root.
      const relativeKey = normalize(`${oldDir ? `${oldDir}/` : ""}${target}`);
      const rootKey = normalize(target.replace(/^\//, ""));
      const find = (key: string | null) => key === null ? undefined : [key, `${key}.md`].find((candidate) => paths.has(candidate));
      resolved = find(relativeKey);
      relativeStyle = resolved !== undefined && (target.startsWith("./") || target.startsWith("../") || resolved !== find(rootKey));
      if (resolved === undefined) resolved = find(rootKey);
    } else {
      const matches = byName.get(stripMd(target).toLowerCase()) ?? [];
      if (matches.length === 1) resolved = matches[0];
    }
    if (!resolved) continue;
    const next = moves.get(resolved) ?? resolved;
    let replacement: string;
    if (target.includes("/")) {
      if (next === resolved && !(relativeStyle && oldDir !== newDir)) continue;
      let written = relativeStyle ? relativePath(newDir, next) : next;
      if (relativeStyle && target.startsWith("./") && !written.startsWith("../")) written = `./${written}`;
      replacement = hadMd || !/\.md$/i.test(next) ? written : stripMd(written);
    } else {
      if (next === resolved) continue;
      const name = basename(next);
      if (name === basename(resolved)) continue; // same name stays resolvable by name alone
      replacement = hadMd || !/\.md$/i.test(name) ? name : stripMd(name);
    }
    if (replacement !== target) edits.push({ start, end, text: replacement });
  }

  const mdLink = /(!?)\[[^\]\n]*\]\((<[^>\n]+>|[^)\n]+?)(\s+"[^"\n]*")?\)/dg;
  for (let match = mdLink.exec(content); match; match = mdLink.exec(content)) {
    if (inFence(match.index)) continue;
    const wrapped = match[2].startsWith("<");
    const url = wrapped ? match[2].slice(1, -1) : match[2];
    if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(url)) continue;
    const hashAt = url.search(/[#?]/);
    const pathPart = safeDecode(hashAt < 0 ? url : url.slice(0, hashAt));
    const tail = hashAt < 0 ? "" : url.slice(hashAt);
    if (!pathPart) continue;
    const rootRelative = pathPart.startsWith("/");
    const relative = normalize(rootRelative ? pathPart.slice(1) : `${oldDir ? `${oldDir}/` : ""}${pathPart}`);
    const fromRoot = normalize(pathPart.replace(/^\//, ""));
    const candidates = [relative, fromRoot].filter((value): value is string => value !== null);
    const resolved = candidates.find((candidate) => paths.has(candidate));
    if (!resolved) continue;
    const next = moves.get(resolved) ?? resolved;
    const isRootStyle = rootRelative || resolved !== relative;
    // Links that stay valid unchanged: target unmoved and source directory unchanged.
    if (next === resolved && oldDir === newDir) continue;
    const written = isRootStyle ? (rootRelative ? `/${next}` : next) : relativePath(newDir, next);
    if (safeDecode(written) === pathPart) continue;
    const [urlStart] = match.indices![2];
    const offset = wrapped ? 1 : 0;
    const replacement = wrapped ? `${written}${tail}` : `${encodeLike(url, written)}${tail}`;
    edits.push({ start: urlStart + offset, end: urlStart + offset + url.length, text: replacement });
  }

  return edits.sort((a, b) => a.start - b.start);
}

/** Applies edits from the end so earlier offsets stay valid. */
export function applyEdits(content: string, edits: readonly TextEdit[]): string {
  let out = content;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return out;
}
