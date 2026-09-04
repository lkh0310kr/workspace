// Pure SRT parsing + SRT->WebVTT conversion for the File Viewer's video
// subtitle support. <track kind="subtitles"> only accepts WebVTT natively
// — SRT is the far more common file people actually have lying around, so
// it needs converting rather than just rejecting it. Three separate
// functions (not one monolith) so shiftCues can re-run cheaply on every
// offset-input change without reparsing the source file each time.

export interface SubtitleCue {
  start: number; // seconds
  end: number; // seconds
  text: string;
}

// SRT timestamps use a comma decimal separator (00:00:01,000); WebVTT
// requires a period (00:00:01.000). Both share the same HH:MM:SS.mmm shape
// otherwise, so one regex with an optional separator covers both — parseSrt
// is lenient enough to also accept an already-VTT-formatted file someone
// renamed to .srt.
const TIMESTAMP = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;
const CUE_TIMING = new RegExp(`${TIMESTAMP.source}\\s*-->\\s*${TIMESTAMP.source}`);

function timestampToSeconds(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

function secondsToVttTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000);
  const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

/** Parses an SRT (or VTT-shaped) subtitle file into cues. Malformed or
 * empty input yields an empty array rather than throwing — this feeds a
 * file the user picked via an OS dialog, not a trusted/validated source,
 * and a bad file should just show no captions rather than crash the pane. */
export function parseSrt(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/);

  for (const block of blocks) {
    const timingMatch = CUE_TIMING.exec(block);
    if (!timingMatch) continue;
    const [, h1, m1, s1, ms1, h2, m2, s2, ms2] = timingMatch;
    const start = timestampToSeconds(h1, m1, s1, ms1);
    const end = timestampToSeconds(h2, m2, s2, ms2);
    if (!(end > start)) continue;

    const textLines = block
      .slice(timingMatch.index + timingMatch[0].length)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const cueText = textLines.join("\n");
    if (!cueText) continue;

    cues.push({ start, end, text: cueText });
  }

  return cues;
}

/** Shifts every cue by a signed offset (seconds) — a start that would go
 * negative clamps to 0 rather than producing an invalid negative
 * timestamp; end is shifted by the same raw offset so the cue's duration
 * is preserved even when its start got clamped. */
export function shiftCues(cues: SubtitleCue[], offsetSeconds: number): SubtitleCue[] {
  return cues.map((cue) => ({
    ...cue,
    start: Math.max(0, cue.start + offsetSeconds),
    end: Math.max(0, cue.end + offsetSeconds),
  }));
}

export function cuesToVtt(cues: SubtitleCue[]): string {
  const body = cues
    .map(
      (cue, i) =>
        `${i + 1}\n${secondsToVttTimestamp(cue.start)} --> ${secondsToVttTimestamp(cue.end)}\n${cue.text}`,
    )
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}
