const PARTICLES = [
  "から",
  "まで",
  "では",
  "には",
  "より",
  "って",
  "へ",
  "に",
  "で",
  "と",
  "を",
  "が",
  "は",
  "も",
  "の",
  "か",
  "ね",
  "よ",
  "な",
  "ば",
  "や",
].sort((a, b) => b.length - a.length);

const TRAILING_PUNCT_RE = /[。、！？!?.…]+$/u;

export function stripTrailingPunctuation(text: string): { body: string; punctuation: string } {
  const match = text.match(TRAILING_PUNCT_RE);
  if (!match) return { body: text, punctuation: "" };
  const punctuation = match[0];
  return { body: text.slice(0, -punctuation.length), punctuation };
}

export function isParticle(surface: string): boolean {
  return PARTICLES.includes(surface);
}

/** Split a line into particle chunks and non-particle runs (no dictionary yet). */
export function splitByParticles(text: string): string[] {
  const chunks: string[] = [];
  let index = 0;
  while (index < text.length) {
    let matchedParticle = false;
    for (const particle of PARTICLES) {
      if (text.slice(index, index + particle.length) === particle) {
        chunks.push(particle);
        index += particle.length;
        matchedParticle = true;
        break;
      }
    }
    if (matchedParticle) continue;

    let end = index + 1;
    while (end < text.length) {
      let startsParticle = false;
      for (const particle of PARTICLES) {
        if (text.slice(end, end + particle.length) === particle) {
          startsParticle = true;
          break;
        }
      }
      if (startsParticle) break;
      end += 1;
    }
    chunks.push(text.slice(index, end));
    index = end;
  }
  return chunks.filter((chunk) => chunk.length > 0);
}

/** Greedy longest-match segmentation using a dictionary lookup predicate. */
export function greedyDictionarySegments(
  chunk: string,
  lookup: (surface: string) => boolean,
): string[] {
  const segments: string[] = [];
  let index = 0;
  while (index < chunk.length) {
    let matched = false;
    for (let length = chunk.length - index; length >= 1; length -= 1) {
      const surface = chunk.slice(index, index + length);
      if (!lookup(surface)) continue;
      segments.push(surface);
      index += length;
      matched = true;
      break;
    }
    if (!matched) {
      segments.push(chunk[index] ?? "");
      index += 1;
    }
  }
  return segments.filter((segment) => segment.length > 0);
}

export function segmentJapaneseLine(
  text: string,
  lookup: (surface: string) => boolean,
): string[] {
  const { body } = stripTrailingPunctuation(text.trim());
  if (!body) return [];

  const rawChunks = splitByParticles(body);
  const segments: string[] = [];
  for (const chunk of rawChunks) {
    if (isParticle(chunk)) {
      segments.push(chunk);
      continue;
    }
    segments.push(...greedyDictionarySegments(chunk, lookup));
  }
  return segments;
}
