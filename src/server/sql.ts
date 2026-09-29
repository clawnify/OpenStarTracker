// Multi-row writes under D1's cap of 100 bound parameters per statement.

import { run } from "./db.js";

/** Headroom under D1's 100-parameter ceiling. */
const MAX_PARAMS = 90;

/**
 * Split rows into statements that each bind at most MAX_PARAMS values. Pure,
 * so the arithmetic is tested without a database.
 */
export function chunkRows<T>(rows: T[], columns: number): T[][] {
  const per = Math.max(1, Math.floor(MAX_PARAMS / columns));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += per) out.push(rows.slice(i, i + per));
  return out;
}

/**
 * `INSERT INTO table (cols) VALUES (…), (…) <tail>` for any number of rows, one
 * statement per chunk. `tail` is the ON CONFLICT clause.
 */
export async function insertMany(table: string, columns: string[], rows: unknown[][], tail = ""): Promise<void> {
  const one = `(${columns.map(() => "?").join(", ")})`;
  for (const chunk of chunkRows(rows, columns.length)) {
    await run(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${chunk.map(() => one).join(", ")} ${tail}`,
      chunk.flat(),
    );
  }
}
