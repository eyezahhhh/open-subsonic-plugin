import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import Database from "better-sqlite3";
import path from "path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const MIGRATION_DIR = path.join(import.meta.dirname, "..", "..", "migrations");

export function createDatabaseClient(dbFile: string) {
	const sqlite = new Database(dbFile);
	sqlite.pragma("journal_mode = WAL");

	sqlite.function("seeded_random", (id: string, seed: string | number) => {
		let hash = Number(seed) || 0;
		for (let i = 0; i < id.length; i++) {
			hash = (Math.imul(31, hash) + id.charCodeAt(i)) | 0;
		}
		return hash;
	});

	const db = drizzle(sqlite, {
		schema,
	});

	migrate(db, { migrationsFolder: MIGRATION_DIR });

	return db;
}

export type DBClient = ReturnType<typeof createDatabaseClient>;
