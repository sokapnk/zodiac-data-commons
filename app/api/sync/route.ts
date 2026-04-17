import { neon } from '@neondatabase/serverless';
import * as Y from 'yjs';

const sql = neon(process.env.POSTGRES_URL!);

export async function GET() {
  await sql`CREATE TABLE IF NOT EXISTS zodiac_docs (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL
  );`;

  const rows = await sql`SELECT state FROM zodiac_docs WHERE id = 'commons'`;
  const state = rows[0]?.state || null;

  return Response.json({ state });
}

export async function POST(request: Request) {
  await sql`CREATE TABLE IF NOT EXISTS zodiac_docs (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL
  );`;

  const { update } = await request.json();
  const incomingUpdate = Uint8Array.from(atob(update), (c) => c.charCodeAt(0));

  const doc = new Y.Doc();

  // Load current server state if exists
  const rows = await sql`SELECT state FROM zodiac_docs WHERE id = 'commons'`;
  if (rows.length > 0) {
    const currentUpdate = Uint8Array.from(atob(rows[0].state), (c) => c.charCodeAt(0));
    Y.applyUpdate(doc, currentUpdate);
  }

  // Merge the incoming update
  Y.applyUpdate(doc, incomingUpdate);

  // Save the new full state
  const newState = Y.encodeStateAsUpdate(doc);
  const newBase64 = btoa(String.fromCharCode(...newState));

  await sql`
    INSERT INTO zodiac_docs (id, state)
    VALUES ('commons', ${newBase64})
    ON CONFLICT (id) DO UPDATE SET state = ${newBase64}
  `;

  return Response.json({ success: true });
}
