import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import Database from "better-sqlite3";
import path from "path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const MIGRATION_DIR = path.join(import.meta.dirname, "..", "..", "migrations");

export function createDatabaseClient(dbFile: string) {
	const sqlite = new Database(dbFile);

	const MEMORY_CACHE_MIB = 512;
	const MMAP_MIB = 512;

	// Concurrently handles multiple reads while a write transaction is active
	sqlite.pragma("journal_mode = WAL");

	// Speeds up writes by delegating physical disk sync timing to the OS
	sqlite.pragma("synchronous = NORMAL");

	// Forces sorting, temporary tables, and indices to live in RAM instead of disk files
	sqlite.pragma("temp_store = MEMORY");

	// Reserves RAM to cache database pages so frequent reads never hit the disk
	sqlite.pragma(`cache_size = ${MEMORY_CACHE_MIB * -1024}`);

	// Maps the database file into memory, bypassing expensive OS system read calls
	sqlite.pragma(`mmap_size = ${MMAP_MIB * 1024 * 1024}`);

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
