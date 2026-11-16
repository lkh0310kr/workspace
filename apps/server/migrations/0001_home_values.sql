CREATE TABLE IF NOT EXISTS home_values (
  login TEXT NOT NULL,
  value_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (login, value_key)
);
