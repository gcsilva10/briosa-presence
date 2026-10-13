import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";

// Uses the GitHub-tracked SQLite snapshot, never the Railway volume.
// Local-only output; do not commit or publish your attendance export.
const source = resolve(process.argv[2] ?? "data/briosa.sqlite");
const destination = resolve(process.argv[3] ?? "briosa-attendances-recovery.json");
const db = new DatabaseSync(source, { readOnly: true });
try {
  const rows = db.prepare("SELECT match_id FROM attendances ORDER BY match_id").all() as Array<{ match_id: string }>;
  const ids = [...new Set(rows.map(row => row.match_id))];
  writeFileSync(destination, JSON.stringify({ format: "briosa-attendances-v1", matchIds: ids }, null, 2));
  console.log(`Encontradas ${ids.length} presenças na cópia SQLite. Exportação local: ${destination}`);
  if (ids.length === 0) console.log("A cópia do GitHub não contém presenças marcadas. Não é prova de que o volume Railway esteja vazio.");
} finally { db.close(); }
