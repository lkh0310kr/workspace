import { getJapaneseUserDb } from "./userDb";

export function logPracticeScore(literal: string, score: number): void {
  const db = getJapaneseUserDb();
  db.prepare("INSERT INTO practice_log (literal, score, practiced_at) VALUES (?, ?, ?)").run(
    literal,
    score,
    new Date().toISOString(),
  );
}
