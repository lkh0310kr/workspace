/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPtyDataMultiplexerForTests,
  bootstrapPtyDataMultiplexer,
  setPtyDataLastSeq,
  subscribePtyData,
} from "./ptyDataMultiplexer";

type PtyDataListener = (id: number, seq: number, data: Uint8Array) => void;

describe("ptyDataMultiplexer", () => {
  let emitPtyData: PtyDataListener;

  beforeEach(() => {
    __resetPtyDataMultiplexerForTests();
    emitPtyData = vi.fn();
    const w = window as unknown as { api: Record<string, unknown> };
    w.api = {
      ...w.api,
      pty: {
        ...(w.api?.pty as Record<string, unknown> | undefined),
        onData: (cb: PtyDataListener) => {
          emitPtyData = cb;
          return () => {
            emitPtyData = vi.fn();
          };
        },
      },
      debug: {
        ...(w.api?.debug as Record<string, unknown> | undefined),
        terminalLog: vi.fn(),
      },
    };
    bootstrapPtyDataMultiplexer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("buffers live chunks that arrive before subscribePtyData", () => {
    emitPtyData(7, 1, new TextEncoder().encode("hello"));
    emitPtyData(7, 2, new TextEncoder().encode(" world"));

    const received: string[] = [];
    subscribePtyData(7, (data) => received.push(data), 0);

    expect(received).toEqual(["hello", " world"]);
  });

  it("drops duplicate seq values after connect snapshot replay", () => {
    const received: string[] = [];
    subscribePtyData(3, (data) => received.push(data), 5);

    emitPtyData(3, 5, new TextEncoder().encode("stale"));
    emitPtyData(3, 6, new TextEncoder().encode("live"));

    expect(received).toEqual(["live"]);
  });

  it("coerces string terminal ids from IPC payloads", () => {
    const received: string[] = [];
    subscribePtyData(9, (data) => received.push(data), 0);

    emitPtyData("9" as unknown as number, 1, new TextEncoder().encode("ok"));

    expect(received).toEqual(["ok"]);
  });

  it("flushes pending chunks after lastSeq is raised post-connect", () => {
    const received: string[] = [];
    subscribePtyData(2, (data) => received.push(data), -1);
    emitPtyData(2, 1, new TextEncoder().encode("early"));

    setPtyDataLastSeq(2, 1);
    emitPtyData(2, 2, new TextEncoder().encode("late"));

    expect(received).toEqual(["early", "late"]);
  });
});
