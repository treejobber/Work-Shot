import Database from "better-sqlite3";

/**
 * Opens (or creates) a SQLite database at the given path.
 * Enables WAL mode for better concurrent read performance.
 * Uses `:memory:` for testing.
 */
export function openDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma("journal_mode = WAL");
  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  return db;
}
