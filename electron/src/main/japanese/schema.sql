-- Japanese dictionary schema v1 (JMdict + KANJIDIC2)

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lexeme (
  ent_seq INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS writing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ent_seq INTEGER NOT NULL REFERENCES lexeme(ent_seq) ON DELETE CASCADE,
  orthography TEXT NOT NULL,
  priority TEXT
);

CREATE INDEX IF NOT EXISTS idx_writing_orthography ON writing(orthography);
CREATE INDEX IF NOT EXISTS idx_writing_ent_seq ON writing(ent_seq);

CREATE TABLE IF NOT EXISTS reading (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ent_seq INTEGER NOT NULL REFERENCES lexeme(ent_seq) ON DELETE CASCADE,
  kana TEXT NOT NULL,
  priority TEXT
);

CREATE INDEX IF NOT EXISTS idx_reading_kana ON reading(kana);
CREATE INDEX IF NOT EXISTS idx_reading_ent_seq ON reading(ent_seq);

CREATE TABLE IF NOT EXISTS sense (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ent_seq INTEGER NOT NULL REFERENCES lexeme(ent_seq) ON DELETE CASCADE,
  sense_no INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sense_ent_seq ON sense(ent_seq);

CREATE TABLE IF NOT EXISTS gloss (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sense_id INTEGER NOT NULL REFERENCES sense(id) ON DELETE CASCADE,
  lang TEXT NOT NULL DEFAULT 'en',
  text TEXT NOT NULL,
  source TEXT
);

CREATE INDEX IF NOT EXISTS idx_gloss_sense_id ON gloss(sense_id);

CREATE TABLE IF NOT EXISTS kanji (
  literal TEXT PRIMARY KEY,
  codepoint INTEGER,
  strokes INTEGER,
  grade INTEGER,
  jlpt INTEGER
);

CREATE TABLE IF NOT EXISTS kanji_reading (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  literal TEXT NOT NULL REFERENCES kanji(literal) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('on', 'kun')),
  text TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kanji_reading_literal ON kanji_reading(literal);

CREATE TABLE IF NOT EXISTS kanji_stroke (
  literal TEXT NOT NULL REFERENCES kanji(literal) ON DELETE CASCADE,
  stroke_order INTEGER NOT NULL,
  path TEXT NOT NULL,
  PRIMARY KEY (literal, stroke_order)
);

CREATE VIRTUAL TABLE IF NOT EXISTS lexeme_fts USING fts5(
  ent_seq UNINDEXED,
  search_text,
  tokenize = 'unicode61'
);
