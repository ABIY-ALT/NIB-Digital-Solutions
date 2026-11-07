// Dev helper: run SQL against DATABASE_URL and print rows.  node scripts/sql.mjs "select 1"
import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
for (const sql of process.argv.slice(2)) {
  try {
    const res = await client.query(sql);
    console.log(JSON.stringify(res.rows ?? res.rowCount, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  } catch (error) {
    console.log(`ERROR: ${error.message}`);
  }
}
await client.end();
