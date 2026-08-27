import { describe, it, expect } from "vitest";
import { emptyHistory, pushHistory, canUndo, canRedo, undo, redo } from "./vectorHistory";
import { createBlankDocument } from "./sceneGraph";

function doc(width: number) {
  return { ...createBlankDocument(), width };
}

describe("pushHistory", () => {
  it("adds the before-state to the past stack", () => {
    const h = pushHistory(emptyHistory(), doc(100), doc(200));
    expect(h.past).toHaveLength(1);
    expect(h.past[0].width).toBe(100);
  });

  it("clears the future (redo) stack on a new push", () => {
    const h1 = pushHistory(emptyHistory(), doc(100), doc(200));
    const afterUndo = undo(h1, doc(200))!;
    expect(canRedo(afterUndo.history)).toBe(true);
    const h2 = pushHistory(afterUndo.history, doc(200), doc(300));
    expect(canRedo(h2)).toBe(false);
  });

  it("is a no-op when before and after are the same reference (nothing changed)", () => {
    const same = doc(100);
    const h = pushHistory(emptyHistory(), same, same);
    expect(h.past).toHaveLength(0);
  });

  it("caps history length so it doesn't grow unbounded", () => {
    let h = emptyHistory();
    for (let i = 0; i < 150; i++) h = pushHistory(h, doc(i), doc(i + 1));
    expect(h.past.length).toBeLessThanOrEqual(100);
  });
});

describe("canUndo / canRedo", () => {
  it("both false on an empty history", () => {
    expect(canUndo(emptyHistory())).toBe(false);
    expect(canRedo(emptyHistory())).toBe(false);
  });
});

describe("undo / redo", () => {
  it("undo restores the previous document and returns null when there's nothing to undo", () => {
    expect(undo(emptyHistory(), doc(100))).toBeNull();
    const h = pushHistory(emptyHistory(), doc(100), doc(200));
    const result = undo(h, doc(200))!;
    expect(result.document.width).toBe(100);
    expect(canUndo(result.history)).toBe(false);
    expect(canRedo(result.history)).toBe(true);
  });

  it("redo restores the document that was undone, and returns null when there's nothing to redo", () => {
    expect(redo(emptyHistory(), doc(100))).toBeNull();
    const h = pushHistory(emptyHistory(), doc(100), doc(200));
    const undone = undo(h, doc(200))!;
    const redone = redo(undone.history, undone.document)!;
    expect(redone.document.width).toBe(200);
    expect(canRedo(redone.history)).toBe(false);
    expect(canUndo(redone.history)).toBe(true);
  });

  it("undo -> redo -> undo round-trips through multiple steps in order", () => {
    let h = emptyHistory();
    h = pushHistory(h, doc(1), doc(2));
    h = pushHistory(h, doc(2), doc(3));
    let current = doc(3);

    const u1 = undo(h, current)!;
    expect(u1.document.width).toBe(2);
    const u2 = undo(u1.history, u1.document)!;
    expect(u2.document.width).toBe(1);
    expect(canUndo(u2.history)).toBe(false);

    const r1 = redo(u2.history, u2.document)!;
    expect(r1.document.width).toBe(2);
    const r2 = redo(r1.history, r1.document)!;
    expect(r2.document.width).toBe(3);
    expect(canRedo(r2.history)).toBe(false);
  });
});
