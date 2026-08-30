import type { JapanesePitchPattern, JapaneseSrsCard } from "../../shared/japaneseTypes";
import { getJapaneseDb } from "./db";
import { getJapaneseUserDb } from "./userDb";

export function reviewSrsCard(entSeq: number, quality: 0 | 1 | 2 | 3 | 4 | 5): JapaneseSrsCard {
  const db = getJapaneseUserDb();
  const now = new Date();
  const existing = db
    .prepare("SELECT ent_seq, due, interval_days, ease, repetitions FROM srs_card WHERE ent_seq = ?")
    .get(entSeq) as
    | { ent_seq: number; due: string; interval_days: number; ease: number; repetitions: number }
    | undefined;

  let interval = existing?.interval_days ?? 0;
  let ease = existing?.ease ?? 2.5;
  let repetitions = existing?.repetitions ?? 0;

  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.max(1, Math.round(interval * ease));
    ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  }

  const due = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO srs_card (ent_seq, due, interval_days, ease, repetitions)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ent_seq) DO UPDATE SET
       due = excluded.due,
       interval_days = excluded.interval_days,
       ease = excluded.ease,
       repetitions = excluded.repetitions`,
  ).run(entSeq, due, interval, ease, repetitions);

  return { entSeq, due, interval, ease };
}

export function listDueSrsCards(limit = 20): JapaneseSrsCard[] {
  const db = getJapaneseUserDb();
  const now = new Date().toISOString();
  const rows = db
    .prepare(
      `SELECT ent_seq, due, interval_days, ease
       FROM srs_card
       WHERE due <= ?
       ORDER BY due
       LIMIT ?`,
    )
    .all(now, limit) as { ent_seq: number; due: string; interval_days: number; ease: number }[];

  return rows.map((row) => ({
    entSeq: row.ent_seq,
    due: row.due,
    interval: row.interval_days,
    ease: row.ease,
  }));
}

export function addSrsCard(entSeq: number): JapaneseSrsCard {
  const db = getJapaneseUserDb();
  const due = new Date().toISOString();
  db.prepare(
    `INSERT INTO srs_card (ent_seq, due, interval_days, ease, repetitions)
     VALUES (?, ?, 0, 2.5, 0)
     ON CONFLICT(ent_seq) DO UPDATE SET due = excluded.due`,
  ).run(entSeq, due);
  return { entSeq, due, interval: 0, ease: 2.5 };
}

export function logPracticeScore(literal: string, score: number): void {
  const db = getJapaneseUserDb();
  db.prepare("INSERT INTO practice_log (literal, score, practiced_at) VALUES (?, ?, ?)").run(
    literal,
    score,
    new Date().toISOString(),
  );
}

export function getLexemePitchPatterns(entSeq: number): JapanesePitchPattern[] {
  const db = getJapaneseDb();
  if (!db) return [];
  const rows = db
    .prepare("SELECT reading, pattern FROM lexeme_pitch WHERE ent_seq = ? ORDER BY reading")
    .all(entSeq) as { reading: string; pattern: string }[];
  return rows.map((row) => ({ reading: row.reading, pattern: row.pattern }));
}
