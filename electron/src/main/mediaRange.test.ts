import { describe, expect, it } from "vitest";
import { parseRangeHeader } from "./mediaRange";

const SIZE = 1000;

describe("parseRangeHeader", () => {
  it("returns null for no header", () => {
    expect(parseRangeHeader(null, SIZE)).toBeNull();
  });

  it("parses an exact range", () => {
    expect(parseRangeHeader("bytes=0-99", SIZE)).toEqual({ start: 0, end: 99 });
  });

  it("parses an open-ended range", () => {
    expect(parseRangeHeader("bytes=500-", SIZE)).toEqual({ start: 500, end: 999 });
  });

  it("parses a suffix range", () => {
    expect(parseRangeHeader("bytes=-100", SIZE)).toEqual({ start: 900, end: 999 });
  });

  it("parses a single-byte range", () => {
    expect(parseRangeHeader("bytes=0-0", SIZE)).toEqual({ start: 0, end: 0 });
  });

  it("covers exactly the whole file", () => {
    expect(parseRangeHeader("bytes=0-999", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("clamps an end past the file size", () => {
    expect(parseRangeHeader("bytes=990-9999", SIZE)).toEqual({ start: 990, end: 999 });
  });

  it("returns null for malformed input", () => {
    expect(parseRangeHeader("not-a-range", SIZE)).toBeNull();
    expect(parseRangeHeader("bytes=-", SIZE)).toBeNull();
  });

  it("returns null when start is past the file size", () => {
    expect(parseRangeHeader("bytes=5000-", SIZE)).toBeNull();
  });

  it("returns null for a zero-length file", () => {
    expect(parseRangeHeader("bytes=0-99", 0)).toBeNull();
  });
});
