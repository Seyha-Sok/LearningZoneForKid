import { Pool } from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { readConfig } from './config.js';
import { createAuth } from './auth.js';

const config = readConfig();
const pool = new Pool({ connectionString: config.databaseURL, max: 2, connectionTimeoutMillis: 5000 });
try {
  const auth = createAuth(pool, config);
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS learners (
      id uuid PRIMARY KEY,
      parent_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS learners_parent_idx ON learners(parent_id);
    CREATE TABLE IF NOT EXISTS learner_progress (
      learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
      letter text NOT NULL CHECK (letter ~ '^[A-Z]$'),
      letter_case text NOT NULL CHECK (letter_case IN ('upper','lower')),
      completed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (learner_id, letter, letter_case)
    );
    CREATE TABLE IF NOT EXISTS listening_rounds (
      id uuid PRIMARY KEY,
      learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
      letter text NOT NULL CHECK (letter ~ '^[A-Z]$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS listening_rounds_learner_idx ON listening_rounds(learner_id);
  `);
  console.log('Authentication, learner profiles, and progress schema are ready.');
} finally { await pool.end(); }
