-- Users (Google OAuth)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  role TEXT DEFAULT 'athlete',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Athletes (client profiles)
CREATE TABLE IF NOT EXISTS athletes (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  coach_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  sport TEXT DEFAULT 'run',
  goals TEXT,
  pbs TEXT,
  profile TEXT,
  strava_refresh_token TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Training blocks
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  athlete_id TEXT REFERENCES athletes(id),
  name TEXT,
  number INTEGER,
  phase TEXT,
  start_date TEXT,
  end_date TEXT,
  stimulus TEXT,
  goals TEXT,
  success_metrics TEXT,
  status TEXT DEFAULT 'upcoming',
  summary TEXT,
  run_volume TEXT,
  bike_volume TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Sessions within blocks
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block_id TEXT REFERENCES blocks(id),
  athlete_id TEXT REFERENCES athletes(id),
  date TEXT NOT NULL,
  type TEXT,
  planned_desc TEXT,
  planned_distance REAL,
  planned_pace TEXT,
  planned_notes TEXT,
  actual_strava_id INTEGER,
  actual_distance REAL,
  actual_time INTEGER,
  actual_pace REAL,
  actual_hr REAL,
  actual_max_hr REAL,
  feedback_rpe INTEGER,
  feedback_feeling TEXT,
  feedback_notes TEXT
);

-- Strava activities (synced)
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  athlete_id TEXT REFERENCES athletes(id),
  name TEXT,
  distance REAL,
  time INTEGER,
  date TEXT,
  pace REAL,
  hr REAL,
  max_hr REAL,
  elevation REAL,
  type TEXT,
  sport TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_athlete ON sessions(athlete_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
CREATE INDEX IF NOT EXISTS idx_sessions_block ON sessions(block_id);
CREATE INDEX IF NOT EXISTS idx_activities_athlete ON activities(athlete_id);
CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date);
CREATE INDEX IF NOT EXISTS idx_athletes_coach ON athletes(coach_id);
CREATE INDEX IF NOT EXISTS idx_athletes_user ON athletes(user_id);
