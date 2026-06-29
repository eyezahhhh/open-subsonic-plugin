import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/db/schema.ts",
	out: "./migrations",
	dbCredentials: {
		url: "../../plugin-cache/open-subsonic/database.sqlite",
	},
});
