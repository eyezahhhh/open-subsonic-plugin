import { DataClient } from "@pipe-bomb/plugin-sdk";
import { DatabaseManager } from "./db/database-manager.js";

export class EventManager {
	constructor(
		private readonly dataClient: DataClient,
		database: DatabaseManager,
	) {
		dataClient.addListener("user-saved-track", (user, track) => {
			console.log(`User "${user.username}" saved track ${track.title}`);
		});

		dataClient.addListener("user-unsaved-track", (user, track) => {
			console.log(`User "${user.username}" unsaved track ${track.title}`);
		});
	}
}
