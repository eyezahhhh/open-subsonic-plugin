import {
	DataClient,
	SavedAlbum,
	SavedArtist,
	SavedTrack,
} from "@pipe-bomb/plugin-sdk";
import { DatabaseManager } from "./db/database-manager.js";

export class EventManager {
	private readonly queue = new Map<string, () => Promise<void>>();
	private flushing = false;

	constructor(
		private readonly dataClient: DataClient,
		private readonly database: DatabaseManager,
	) {
		this.dataClient.addListener("user-saved-track", (user, track) => {
			this.database.setSaved("track", user.uuid, track.uuid, true);
		});

		this.dataClient.addListener("user-unsaved-track", (user, track) => {
			this.database.setSaved("track", user.uuid, track.uuid, false);
		});

		this.dataClient.addListener("user-saved-album", (user, album) => {
			this.database.setSaved("album", user.uuid, album.uuid, true);
		});

		this.dataClient.addListener("user-unsaved-album", (user, album) => {
			this.database.setSaved("album", user.uuid, album.uuid, false);
		});

		this.dataClient.addListener("user-saved-artist", (user, artist) => {
			this.database.setSaved("artist", user.uuid, artist.uuid, true);
		});

		this.dataClient.addListener("user-unsaved-artist", (user, artist) => {
			this.database.setSaved("artist", user.uuid, artist.uuid, false);
		});

		const refreshTrack = (track: SavedTrack) =>
			this.enqueue(`track:${track.uuid}`, () =>
				this.database.refreshTrack(
					track.pluginId,
					track.libraryId,
					track.trackId,
					track.uuid,
				),
			);
		this.dataClient.addListener("track-added", refreshTrack);
		this.dataClient.addListener("track-attributes-updated", refreshTrack);
		this.dataClient.addListener("track-artists-updated", refreshTrack);
		this.dataClient.addListener("track-albums-updated", refreshTrack);
		this.dataClient.addListener("track-removed", (track) =>
			this.enqueue(`track:${track.uuid}`, () =>
				this.database.removeTrack(track.uuid),
			),
		);

		const refreshAlbum = (album: SavedAlbum) =>
			this.enqueue(`album:${album.uuid}`, () =>
				this.database.refreshAlbum(album.uuid),
			);
		this.dataClient.addListener("album-added", refreshAlbum);
		this.dataClient.addListener("album-attributes-updated", refreshAlbum);
		this.dataClient.addListener("album-tracklist-updated", refreshAlbum);
		this.dataClient.addListener("album-artists-updated", refreshAlbum);
		this.dataClient.addListener("album-removed", (album) =>
			this.enqueue(`album:${album.uuid}`, () =>
				this.database.removeAlbum(album.uuid),
			),
		);

		const refreshArtist = (artist: SavedArtist) =>
			this.enqueue(`artist:${artist.uuid}`, () =>
				this.database.refreshArtist(artist.uuid),
			);
		this.dataClient.addListener("artist-added", refreshArtist);
		this.dataClient.addListener("artist-attributes-updated", refreshArtist);
		this.dataClient.addListener("artist-removed", (artist) =>
			this.enqueue(`artist:${artist.uuid}`, () =>
				this.database.removeArtist(artist.uuid),
			),
		);
	}

	private enqueue(key: string, task: () => Promise<void>) {
		this.queue.set(key, task);
		void this.flush();
	}

	private async flush() {
		if (this.flushing) {
			return;
		}
		this.flushing = true;
		try {
			while (this.queue.size) {
				const entry = this.queue.entries().next().value;
				if (!entry) {
					break;
				}
				const [key, task] = entry;
				this.queue.delete(key);
				try {
					await task();
				} catch {
					// Errors are handled and logged within the DatabaseManager.
				}
			}
		} finally {
			this.flushing = false;
		}
	}
}
