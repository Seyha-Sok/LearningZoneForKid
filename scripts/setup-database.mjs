// Run once with PGUSER/PGPASSWORD for a local PostgreSQL administrator.
// Credentials are written only to ignored .env, never to console output.
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';

try { await access('.env'); throw new Error('.env already exists; refusing to overwrite local configuration'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const admin = new Client({ host: process.env.PGHOST || '127.0.0.1', port: Number(process.env.PGPORT || 5432), database: 'postgres', user: process.env.PGUSER, password: process.env.PGPASSWORD, connectionTimeoutMillis: 5000 });
await admin.connect();
try {
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname='little_letters' UNION ALL SELECT 1 FROM pg_roles WHERE rolname='little_letters_app'");
  if (existing.rowCount) throw new Error('App database or role already exists; inspect before proceeding');
  const password = randomBytes(32).toString('hex');
  // Generated hex only; identifiers are fixed constants.
  await admin.query(`CREATE ROLE little_letters_app LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  await admin.query('CREATE DATABASE little_letters OWNER little_letters_app');
  await writeFile('.env', [
    'API_HOST=127.0.0.1', 'API_PORT=3001',
    `DATABASE_URL=postgresql://little_letters_app:${password}@127.0.0.1:5432/little_letters`,
    `BETTER_AUTH_SECRET=${randomBytes(48).toString('hex')}`,
    'BETTER_AUTH_URL=http://127.0.0.1:5173',
    'APP_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://192.168.1.10:5173',
    '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  console.log('Created Little Letters database and dedicated application role. Local configuration saved.');
} finally { await admin.end(); }
