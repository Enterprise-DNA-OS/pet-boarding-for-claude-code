import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
const db=await getDb();
try { await db.exec(readFileSync(path.join(REPO_ROOT,'supabase/seed.sql'),'utf8')); console.log('Seed loaded (idempotent fictional records).'); } finally { await db.close(); }
