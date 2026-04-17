import { sql } from '@vercel/postgres';
import * as Y from 'yjs';

export async function GET() {
  // Ensure table exists
  await sql`CREATE TABLE IF NOT EXISTS zodiac_docs (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL
  );`;

  const { rows } = await sql`SELECT state FROM zodiac_docs WHERE id = 'commons'`;
  const state = rows[0]?.state || null;

  return Response.json({ state });
}

export async function POST(request: Request) {
  // Ensure table exists
  await sql`CREATE TABLE IF NOT EXISTS zodiac_docs (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL
  );`;

  const { update } = await request.json();

  const incomingUpdate = Uint8Array.from(atob(update), (c) => c.charCodeAt(0));

  // Load current state or start fresh
  const { rows } = await sql`SELECT state FROM zodiac_docs WHERE id = 'commons'`;
  const doc = new Y.Doc();

  if (rows.length > 0) {
    const currentUpdate = Uint8Array.from(atob(rows[0].state), (c) => c.charCodeAt(0));
    Y.applyUpdate(doc, currentUpdate);
  }

  Y.applyUpdate(doc, incomingUpdate);

  const newState = Y.encodeStateAsUpdate(doc);
  const newBase64 = btoa(String.fromCharCode(...newState));

  await sql`
    INSERT INTO zodiac_docs (id, state)
    VALUES ('commons', ${newBase64})
    ON CONFLICT (id) DO UPDATE SET state = ${newBase64}
  `;

  return Response.json({ success: true });
}
