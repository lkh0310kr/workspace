type MoraLevel = "H" | "L";

function parsePitchPattern(pattern: string, moraCount: number): MoraLevel[] {
  if (moraCount === 0) return [];

  if (pattern.includes(",")) {
    const levels = pattern.split(",").map((part) => (part.trim() === "1" ? "H" : "L"));
    while (levels.length < moraCount) levels.push("L");
    return levels.slice(0, moraCount) as MoraLevel[];
  }

  const accentPos = Number(pattern);
  if (Number.isFinite(accentPos)) {
    const levels: MoraLevel[] = [];
    for (let i = 0; i < moraCount; i += 1) {
      if (accentPos === 0) levels.push(i === 0 ? "H" : "L");
      else levels.push(i <= accentPos ? "H" : "L");
    }
    return levels;
  }

  return Array.from({ length: moraCount }, () => "L");
}

interface Props {
  reading: string;
  pattern: string;
}

export function PitchAccentDisplay({ reading, pattern }: Props) {
  const morae = [...reading];
  const levels = parsePitchPattern(pattern, morae.length);

  return (
    <span className="japanese-pitch-display" title={`패턴 ${pattern}`}>
      {morae.map((char, index) => (
        <span
          key={`${char}-${index}`}
          className={`japanese-pitch-mora${levels[index] === "H" ? " is-high" : " is-low"}`}
        >
          {char}
        </span>
      ))}
    </span>
  );
}
