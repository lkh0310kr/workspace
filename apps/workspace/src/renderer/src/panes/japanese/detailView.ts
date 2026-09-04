export type DetailView =
  | { kind: "none" }
  | { kind: "lexeme"; entSeq: number }
  | { kind: "kanji"; literal: string };

/** The auto-select effect in JapanesePaneContent depends on the current
 * detail, so storing a fresh object for an unchanged view re-triggers it
 * forever. */
export function sameDetail(a: DetailView, b: DetailView): boolean {
  if (a.kind === "lexeme" && b.kind === "lexeme") return a.entSeq === b.entSeq;
  if (a.kind === "kanji" && b.kind === "kanji") return a.literal === b.literal;
  return a.kind === b.kind;
}
