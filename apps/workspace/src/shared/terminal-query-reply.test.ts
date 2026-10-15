import { Terminal } from "@xterm/headless";
import { describe, expect, it } from "vitest";
import {
  extractOnlyCookedEchoSafeQueryReplies,
  extractOnlyTerminalQueryReplies,
  isTerminalQueryReply,
  needsCookedEchoSafeQueryReply,
} from "./terminal-query-reply";

describe("isTerminalQueryReply", () => {
  it("routes complete Kitty graphics acknowledgements as replies", () => {
    const ok = "\x1b_Gi=31;OK\x1b\\";
    const error = "\x1b_Gi=31,p=2;ENOENT:image not found\x1b\\";
    expect(isTerminalQueryReply(ok)).toBe(true);
    expect(isTerminalQueryReply(error)).toBe(true);
    expect(extractOnlyTerminalQueryReplies(ok + error)).toEqual([ok, error]);
    expect(needsCookedEchoSafeQueryReply(ok)).toBe(false);
    for (const input of [
      "\x1b_",
      "\x1b_Gi=31;OK",
      "\x1b_Gi=31;OK\x07",
      "\x1b_Gi=31;hello\x1b\\",
      "\x1b_Ga=q,i=31;AAAA\x1b\\",
      `${ok}typed`,
    ]) {
      expect(isTerminalQueryReply(input)).toBe(false);
      expect(extractOnlyTerminalQueryReplies(input)).toBeNull();
    }
  });

  it("matches synthetic query replies that must be sent immediately", () => {
    expect(isTerminalQueryReply("\x1b[3;1R")).toBe(true);
    expect(isTerminalQueryReply("\x1b[22;1R")).toBe(true);
    expect(isTerminalQueryReply("\x1b[0n")).toBe(true);
    expect(isTerminalQueryReply("\x1b[?997;1n")).toBe(true);
    expect(isTerminalQueryReply("\x1b[?997;2n")).toBe(true);
    expect(isTerminalQueryReply("\x1b[?1;2c")).toBe(true);
    expect(isTerminalQueryReply("\x1b[?61;4c")).toBe(true);
    expect(isTerminalQueryReply("\x1b[>0;276;0c")).toBe(true);
    expect(isTerminalQueryReply("\x1b[6;16;8t")).toBe(true);
    expect(isTerminalQueryReply("\x1b[4;384;640t")).toBe(true);
    expect(isTerminalQueryReply("\x1b[?2026;2$y")).toBe(true);
    expect(isTerminalQueryReply("\x1b[4;1$y")).toBe(true);
    expect(isTerminalQueryReply("\x1b]11;rgb:2828/2c2c/3434\x1b\\")).toBe(true);
    expect(isTerminalQueryReply("\x1b]10;rgb:c0c0/c0c0/c0c0\x07")).toBe(true);
    expect(isTerminalQueryReply("\x1b[?12;5R")).toBe(true);
    expect(isTerminalQueryReply("\x1b[8;24;80t")).toBe(true);
    expect(isTerminalQueryReply("\x1b[?0u")).toBe(true);
    expect(isTerminalQueryReply("\x1b[?31u")).toBe(true);
    expect(isTerminalQueryReply("\x1bP1$r2 q\x1b\\")).toBe(true);
    expect(isTerminalQueryReply("\x1bP1$r0m\x1b\\")).toBe(true);
    expect(isTerminalQueryReply("\x1bP0$r\x1b\\")).toBe(true);
    expect(isTerminalQueryReply("\x1bP>|xterm.js(5.6.0)\x1b\\")).toBe(true);
  });

  it("classifies the fully framed XTVERSION reply emitted by real xterm", async () => {
    const terminal = new Terminal();
    const replies: string[] = [];
    const disposable = terminal.onData((data) => replies.push(data));
    try {
      await new Promise<void>((resolve) => terminal.write("\x1b[>q", resolve));
      expect(replies).toHaveLength(1);
      const reply = replies[0];
      expect(reply.startsWith("\x1bP>|xterm.js(")).toBe(true);
      expect(reply.endsWith(")\x1b\\")).toBe(true);
      expect(isTerminalQueryReply(reply)).toBe(true);
    } finally {
      disposable.dispose();
      terminal.dispose();
    }
  });

  it("documents the accepted modified-F3/CPR collision", () => {
    expect(isTerminalQueryReply("\x1b[1;2R")).toBe(true);
  });

  it("routes only cooked-echo-risk replies through the ECHO-safe write path", () => {
    expect(needsCookedEchoSafeQueryReply("\x1b[?997;1n")).toBe(true);
    expect(needsCookedEchoSafeQueryReply("\x1b[?997;2n")).toBe(true);
    expect(needsCookedEchoSafeQueryReply("\x1b]11;rgb:00/00/00\x07")).toBe(true);
    expect(needsCookedEchoSafeQueryReply("\x1b[3;1R")).toBe(false);
    expect(needsCookedEchoSafeQueryReply("\x1b[0n")).toBe(false);
    expect(needsCookedEchoSafeQueryReply("\x1b[?1;2c")).toBe(false);
    expect(needsCookedEchoSafeQueryReply("y")).toBe(false);
    expect(needsCookedEchoSafeQueryReply("\x1b[A")).toBe(false);
    expect(needsCookedEchoSafeQueryReply("\x1b[?997;1n\x1b[?997;1n")).toBe(false);
    expect(extractOnlyCookedEchoSafeQueryReplies("\x1b[?997;1n\x1b[?997;1n")).toEqual([
      "\x1b[?997;1n",
      "\x1b[?997;1n",
    ]);
    expect(extractOnlyCookedEchoSafeQueryReplies("\x1b[?997;1ny")).toBe(null);
    expect(extractOnlyTerminalQueryReplies("\x1b[?1;2c\x1b[1;1R")).toEqual([
      "\x1b[?1;2c",
      "\x1b[1;1R",
    ]);
    expect(extractOnlyTerminalQueryReplies("\x1b]11;rgb:2828/2c2c/3434\x1b\\\x1b[?1;2c")).toEqual([
      "\x1b]11;rgb:2828/2c2c/3434\x1b\\",
      "\x1b[?1;2c",
    ]);
    expect(extractOnlyTerminalQueryReplies("\x1b[?1;2chello")).toBe(null);
  });

  it("does NOT match ordinary typed input or navigation sequences", () => {
    expect(isTerminalQueryReply("yes")).toBe(false);
    expect(isTerminalQueryReply("y")).toBe(false);
    expect(isTerminalQueryReply("\r")).toBe(false);
    expect(isTerminalQueryReply("\x03")).toBe(false);
    expect(isTerminalQueryReply("\x1b[A")).toBe(false);
    expect(isTerminalQueryReply("\x1b[B")).toBe(false);
    expect(isTerminalQueryReply("\x1b[C")).toBe(false);
    expect(isTerminalQueryReply("\x1b[D")).toBe(false);
    expect(isTerminalQueryReply("\x1b[H")).toBe(false);
    expect(isTerminalQueryReply("\x1b[F")).toBe(false);
    expect(isTerminalQueryReply("\x1b[15~")).toBe(false);
    expect(isTerminalQueryReply("\x1b[3~")).toBe(false);
    expect(isTerminalQueryReply("\x1b")).toBe(false);
    expect(isTerminalQueryReply("\x1bb")).toBe(false);
    expect(isTerminalQueryReply("\x1bP")).toBe(false);
    expect(isTerminalQueryReply("\x1b[97;5u")).toBe(false);
    expect(isTerminalQueryReply("\x1b[13u")).toBe(false);
    expect(isTerminalQueryReply("\x1b[1;2P")).toBe(false);
    expect(isTerminalQueryReply("\x1b[1;2Q")).toBe(false);
    expect(isTerminalQueryReply("\x1b[1;2S")).toBe(false);
    expect(isTerminalQueryReply("\x1b[200~")).toBe(false);
    expect(isTerminalQueryReply("\x1b[201~")).toBe(false);
    expect(isTerminalQueryReply("\x1b]11;rgb:2828/2c2c/3434")).toBe(false);
    expect(isTerminalQueryReply("\x1bP1$r2 q")).toBe(false);
  });
});
