import { DataClient } from "@pipe-bomb/plugin-sdk";
import { DatabaseManager } from "./db/database-manager.js";

export class EventManager {
	constructor(
		dataClient: DataClient,
		database: DatabaseManager,
	) {
		dataClient.addListener("user-saved-track", (user, track) => {
			database.setSaved("track", user.uuid, track.uuid, true);
		});

		dataClient.addListener("user-unsaved-track", (user, track) => {
			database.setSaved("track", user.uuid, track.uuid, false);
		});

		dataClient.addListener("user-saved-album", (user, album) => {
			database.setSaved("album", user.uuid, album.uuid, true);
		});

		dataClient.addListener("user-unsaved-album", (user, album) => {
			database.setSaved("album", user.uuid, album.uuid, false);
		});

		dataClient.addListener("user-saved-artist", (user, artist) => {
			database.setSaved("artist", user.uuid, artist.uuid, true);
		});

		dataClient.addListener("user-unsaved-artist", (user, artist) => {
			database.setSaved("artist", user.uuid, artist.uuid, false);
		});
	}
}
