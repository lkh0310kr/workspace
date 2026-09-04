// Pure HTTP Range header parsing for the streaming media protocol
// (mediaProtocol.ts) — <video>/<audio> elements issue Range requests
// automatically when the user seeks; without honoring them the element
// falls back to loading (and re-loading, on every seek) the entire file
// from byte 0.

export interface RangeSlice {
  start: number;
  end: number; // inclusive
}

/** Parses a `Range: bytes=...` header value against a known file size.
 * Returns null for "serve the whole file" (no header, or a header this
 * function can't make sense of — the only realistic caller here is a
 * browser's own media element, not an adversary, so malformed input is
 * treated leniently as "no range" rather than an error). */
export function parseRangeHeader(header: string | null, fileSize: number): RangeSlice | null {
  if (!header || fileSize <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, startText, endText] = match;
  if (startText === "" && endText === "") return null;

  let start: number;
  let end: number;

  if (startText === "") {
    // Suffix range: last N bytes.
    const suffixLength = Number(endText);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = Number(startText);
    end = endText === "" ? fileSize - 1 : Number(endText);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  end = Math.min(end, fileSize - 1);
  if (start < 0 || end < start || start >= fileSize) return null;

  return { start, end };
}
