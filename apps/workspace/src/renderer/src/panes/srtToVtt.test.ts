import { describe, expect, it } from "vitest";
import { cuesToVtt, parseSrt, shiftCues } from "./srtToVtt";

const SIMPLE_SRT = `1
00:00:01,000 --> 00:00:03,500
Hello world

2
00:00:04,000 --> 00:00:06,000
Second line
`;

describe("parseSrt", () => {
  it("parses a basic single-cue file", () => {
    const cues = parseSrt("1\n00:00:01,000 --> 00:00:03,500\nHello world\n");
    expect(cues).toEqual([{ start: 1, end: 3.5, text: "Hello world" }]);
  });

  it("converts comma decimal separators correctly", () => {
    const cues = parseSrt("1\n00:01:02,250 --> 00:01:03,750\nText\n");
    expect(cues[0].start).toBeCloseTo(62.25);
    expect(cues[0].end).toBeCloseTo(63.75);
  });

  it("parses multiple cues separated by blank lines", () => {
    const cues = parseSrt(SIMPLE_SRT);
    expect(cues).toHaveLength(2);
    expect(cues[1]).toEqual({ start: 4, end: 6, text: "Second line" });
  });

  it("joins multi-line cue text", () => {
    const cues = parseSrt("1\n00:00:01,000 --> 00:00:02,000\nLine one\nLine two\n");
    expect(cues[0].text).toBe("Line one\nLine two");
  });

  it("returns an empty array for malformed input instead of throwing", () => {
    expect(parseSrt("not a subtitle file")).toEqual([]);
    expect(parseSrt("")).toEqual([]);
  });

  it("skips a cue whose end isn't after its start", () => {
    expect(parseSrt("1\n00:00:05,000 --> 00:00:01,000\nBad\n")).toEqual([]);
  });
});

describe("shiftCues", () => {
  const cues = [{ start: 10, end: 12, text: "x" }];

  it("shifts forward", () => {
    expect(shiftCues(cues, 5)).toEqual([{ start: 15, end: 17, text: "x" }]);
  });

  it("shifts backward", () => {
    expect(shiftCues(cues, -3)).toEqual([{ start: 7, end: 9, text: "x" }]);
  });

  it("clamps a negative start to 0", () => {
    expect(shiftCues(cues, -100)).toEqual([{ start: 0, end: 0, text: "x" }]);
  });
});

describe("cuesToVtt", () => {
  it("emits the WEBVTT header and period-separated timestamps", () => {
    const vtt = cuesToVtt([{ start: 1, end: 3.5, text: "Hello world" }]);
    expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
    expect(vtt).toContain("00:00:01.000 --> 00:00:03.500");
    expect(vtt).toContain("Hello world");
  });

  it("numbers multiple cues sequentially", () => {
    const vtt = cuesToVtt([
      { start: 0, end: 1, text: "a" },
      { start: 1, end: 2, text: "b" },
    ]);
    expect(vtt).toMatch(/1\n00:00:00\.000/);
    expect(vtt).toMatch(/2\n00:00:01\.000/);
  });
});
