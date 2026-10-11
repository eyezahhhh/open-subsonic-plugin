import {
	DataClient,
	Logger,
	PlaybackHistoryClient,
	SavedAttribute,
} from "@pipe-bomb/plugin-sdk";
import { DBClient } from "./client.js";
import { randomUUID } from "crypto";
import Formatter from "./db-formatter.js";
import * as Schema from "./schema.js";
import {
	and,
	eq,
	inArray,
	ne,
	notExists,
	notInArray,
	sql,
} from "drizzle-orm";

const EVENT_SYNC_ID = "event";

function collectGenres(attributes: SavedAttribute[] | null): Set<string> {
	const genres = new Set<string>();
	for (const attribute of attributes ?? []) {
		if (attribute.key === "genre" && attribute.type === "string") {
			for (const value of attribute.values) {
				genres.add(value);
			}
		}
	}
	return genres;
}

export class DatabaseManager {
	constructor(
		private readonly db: DBClient,
		private readonly dataClient: DataClient,
		private readonly historyClient: PlaybackHistoryClient,
		private readonly logger: Logger,
	) {}

	getClient() {
		return this.db;
	}

	async setSaved(
		kind: "track" | "album" | "artist",
		userId: string,
		id: string,
		saved: boolean,
	) {
		const syncId = EVENT_SYNC_ID;
		const dateSaved = Date.now();
		try {
			if (kind === "track") {
				if (saved) {
					await this.db
						.insert(Schema.songSaves)
						.values({ songId: id, userId, syncId, dateSaved })
						.onConflictDoUpdate({
							target: [Schema.songSaves.songId, Schema.songSaves.userId],
							set: { syncId, dateSaved },
						});
				} else {
					await this.db
						.delete(Schema.songSaves)
						.where(
							and(
								eq(Schema.songSaves.songId, id),
								eq(Schema.songSaves.userId, userId),
							),
						);
				}
			} else if (kind === "album") {
				if (saved) {
					await this.db
						.insert(Schema.albumSaves)
						.values({ albumId: id, userId, syncId, dateSaved })
						.onConflictDoUpdate({
							target: [Schema.albumSaves.albumId, Schema.albumSaves.userId],
							set: { syncId, dateSaved },
						});
				} else {
					await this.db
						.delete(Schema.albumSaves)
						.where(
							and(
								eq(Schema.albumSaves.albumId, id),
								eq(Schema.albumSaves.userId, userId),
							),
						);
				}
			} else {
				if (saved) {
					await this.db
						.insert(Schema.artistSaves)
						.values({ artistId: id, userId, syncId, dateSaved })
						.onConflictDoUpdate({
							target: [Schema.artistSaves.artistId, Schema.artistSaves.userId],
							set: { syncId, dateSaved },
						});
				} else {
					await this.db
						.delete(Schema.artistSaves)
						.where(
							and(
								eq(Schema.artistSaves.artistId, id),
								eq(Schema.artistSaves.userId, userId),
							),
						);
				}
			}
		} catch (e) {
			this.logger.error(
				`Failed to ${saved ? "save" : "unsave"} ${kind} "${id}" for user "${userId}":`,
				e,
			);
		}
	}

	private async upsertGenres(names: Iterable<string>) {
		const unique = [...new Set(names)];
		if (!unique.length) {
			return;
		}
		await this.db
			.insert(Schema.genres)
			.values(unique.map((name) => ({ name, syncId: EVENT_SYNC_ID })))
			.onConflictDoNothing();
	}

	private async pruneGenres() {
		await this.db.delete(Schema.genres).where(
			and(
				notExists(
					this.db
						.select()
						.from(Schema.songGenres)
						.where(eq(Schema.songGenres.name, Schema.genres.name)),
				),
				notExists(
					this.db
						.select()
						.from(Schema.albumGenres)
						.where(eq(Schema.albumGenres.name, Schema.genres.name)),
				),
			),
		);
	}

	async refreshArtist(uuid: string) {
		try {
			const artist = await this.dataClient.getArtist(uuid, {
				relations: {
					albums: true,
					attributes: true,
					identities: true,
				},
			});
			if (!artist) {
				await this.removeArtist(uuid);
				return;
			}

			await this.db
				.insert(Schema.artists)
				.values({ ...Formatter.toArtist(artist), syncId: EVENT_SYNC_ID })
				.onConflictDoUpdate({
					target: Schema.artists.id,
					set: {
						syncId: EVENT_SYNC_ID,
						name: sql`excluded.name`,
						coverArt: sql`excluded.cover_art`,
						albumCount: sql`excluded.album_count`,
						musicBrainzId: sql`excluded.musicbrainz_id`,
					},
				});
		} catch (e) {
			this.logger.error(`Failed to refresh Artist "${uuid}":`, e);
		}
	}

	async removeArtist(uuid: string) {
		try {
			await this.db.delete(Schema.artists).where(eq(Schema.artists.id, uuid));
		} catch (e) {
			this.logger.error(`Failed to remove Artist "${uuid}":`, e);
		}
	}

	async refreshTrack(
		pluginId: string,
		libraryId: string,
		trackId: string,
		uuid: string,
	) {
		try {
			const track = await this.dataClient.getTrack(
				pluginId,
				libraryId,
				trackId,
				{
					relations: {
						attributes: true,
						identities: true,
						artists: {
							attributes: true,
						},
						albums: {
							attributes: true,
						},
					},
				},
			);
			if (!track) {
				await this.removeTrack(uuid);
				return;
			}

			for (const artistUuid of new Set(
				(track.artists ?? []).map((link) => link.artistUuid),
			)) {
				await this.refreshArtist(artistUuid);
			}

			const songs = Formatter.toSong(track).map((song) => ({
				...song,
				syncId: EVENT_SYNC_ID,
			}));
			const songIds = songs.map((song) => song.id);

			await this.db
				.insert(Schema.songs)
				.values(songs)
				.onConflictDoUpdate({
					target: Schema.songs.id,
					set: {
						syncId: EVENT_SYNC_ID,
						title: sql`excluded.title`,
						coverArt: sql`excluded.cover_art`,
						duration: sql`excluded.duration`,
						bitrate: sql`excluded.bitrate`,
						samplerate: sql`excluded.samplerate`,
						channels: sql`excluded.channels`,
						rating: sql`excluded.rating`,
						bpm: sql`excluded.bpm`,
						albumId: sql`excluded.album_id`,
						musicBrainzId: sql`excluded.musicbrainz_id`,
						trackNumber: sql`excluded.track_number`,
						discNumber: sql`excluded.disc_number`,
					},
				});

			await this.db
				.delete(Schema.songs)
				.where(
					and(
						eq(Schema.songs.originalUuid, uuid),
						notInArray(Schema.songs.id, songIds),
					),
				);

			await this.db
				.delete(Schema.songArtists)
				.where(inArray(Schema.songArtists.songId, songIds));
			await this.db
				.delete(Schema.songGenres)
				.where(inArray(Schema.songGenres.songId, songIds));

			if (track.artists?.length) {
				const links: Schema.SongArtist[] = [];
				for (const songId of songIds) {
					for (const link of track.artists) {
						links.push({
							songId,
							artistId: link.artistUuid,
							ordinal: link.ordinal,
							joinPhrase: link.joinPhrase,
							syncId: EVENT_SYNC_ID,
						});
					}
				}
				await this.db.insert(Schema.songArtists).values(links);
			}

			const genres = collectGenres(track.attributes);
			if (genres.size) {
				await this.upsertGenres(genres);
				const rows: Schema.SongGenre[] = [];
				for (const songId of songIds) {
					for (const name of genres) {
						rows.push({ songId, name, syncId: EVENT_SYNC_ID });
					}
				}
				await this.db.insert(Schema.songGenres).values(rows);
			}

			await this.pruneGenres();
		} catch (e) {
			this.logger.error(`Failed to refresh Track "${uuid}":`, e);
		}
	}

	async removeTrack(uuid: string) {
		try {
			await this.db
				.delete(Schema.songs)
				.where(eq(Schema.songs.originalUuid, uuid));
			await this.db
				.delete(Schema.songSaves)
				.where(eq(Schema.songSaves.songId, uuid));
			await this.pruneGenres();
		} catch (e) {
			this.logger.error(`Failed to remove Track "${uuid}":`, e);
		}
	}

	async refreshAlbum(uuid: string) {
		try {
			const album = await this.dataClient.getAlbum(uuid, {
				relations: {
					artists: {
						attributes: true,
					},
					attributes: true,
					identities: true,
					tracks: {
						attributes: true,
					},
				},
			});
			if (!album) {
				await this.removeAlbum(uuid);
				return;
			}

			for (const artistUuid of new Set(
				(album.artists ?? []).map((link) => link.artistUuid),
			)) {
				await this.refreshArtist(artistUuid);
			}

			await this.db
				.insert(Schema.albums)
				.values({ ...Formatter.toAlbum(album), syncId: EVENT_SYNC_ID })
				.onConflictDoUpdate({
					target: Schema.albums.id,
					set: {
						syncId: EVENT_SYNC_ID,
						title: sql`excluded.title`,
						displayArtist: sql`excluded.display_artist`,
						coverArt: sql`excluded.cover_art`,
						songCount: sql`excluded.song_count`,
						duration: sql`excluded.duration`,
						dateCreated: sql`excluded.date_created`,
						year: sql`excluded.year`,
						musicBrainzId: sql`excluded.musicbrainz_id`,
					},
				});

			await this.db
				.delete(Schema.albumArtists)
				.where(eq(Schema.albumArtists.albumId, uuid));
			if (album.artists?.length) {
				await this.db.insert(Schema.albumArtists).values(
					album.artists.map((link) => ({
						albumId: link.albumUuid,
						artistId: link.artistUuid,
						ordinal: link.ordinal,
						joinPhrase: link.joinPhrase,
						syncId: EVENT_SYNC_ID,
					})),
				);
			}

			await this.db
				.delete(Schema.albumGenres)
				.where(eq(Schema.albumGenres.albumId, uuid));
			const genres = collectGenres(album.attributes);
			if (genres.size) {
				await this.upsertGenres(genres);
				await this.db.insert(Schema.albumGenres).values(
					[...genres].map((name) => ({
						albumId: uuid,
						name,
						syncId: EVENT_SYNC_ID,
					})),
				);
			}

			await this.pruneGenres();
		} catch (e) {
			this.logger.error(`Failed to refresh Album "${uuid}":`, e);
		}
	}

	async removeAlbum(uuid: string) {
		try {
			await this.db.delete(Schema.albums).where(eq(Schema.albums.id, uuid));
			await this.db
				.delete(Schema.songs)
				.where(eq(Schema.songs.albumId, uuid));
			await this.pruneGenres();
		} catch (e) {
			this.logger.error(`Failed to remove Album "${uuid}":`, e);
		}
	}

	async sync(onProgress: (fraction: number) => void) {
		const STEPS = 3;
		const yieldToEventLoop = () =>
			new Promise<void>((resolve) => setImmediate(resolve));

		const syncId = randomUUID();

		const completedGenres = new Set<string>();
		let genreChunk: Schema.Genre[] = [];

		const totalArtists = await this.dataClient.getArtistCount();
		let completedArtists = 0;
		let artistChunk: Schema.Artist[] = [];
		const insertArtists = async () => {
			if (artistChunk.length) {
				await this.db
					.insert(Schema.artists)
					.values(artistChunk)
					.onConflictDoUpdate({
						target: Schema.artists.id,
						set: {
							syncId: sql`excluded.sync_id`,
							name: sql`excluded.name`,
							coverArt: sql`excluded.cover_art`,
							albumCount: sql`excluded.album_count`,
							musicBrainzId: sql`excluded.musicbrainz_id`,
						},
					});
				artistChunk = [];
				await yieldToEventLoop();
			}
		};

		await this.dataClient.forEachArtistId(async (artistUuid) => {
			try {
				const artist = await this.dataClient.getArtist(artistUuid, {
					relations: {
						albums: true,
						attributes: true,
						identities: true,
					},
				});
				if (artist) {
					artistChunk.push({ ...Formatter.toArtist(artist), syncId });
				}
				if (artistChunk.length >= 10) {
					await insertArtists();
				}
			} catch (e) {
				this.logger.error(`Failed to sync Artist "${artistUuid}":`, e);
			} finally {
				this.logger.debug(
					`Syncing Artists (${++completedArtists}/${totalArtists})`,
				);
				onProgress(completedArtists / totalArtists / STEPS);
			}
		});
		await insertArtists();

		const totalAlbums = await this.dataClient.getAlbumCount();
		let completedAlbums = 0;
		let albumChunk: Schema.Album[] = [];
		let albumArtistChunk: Schema.AlbumArtist[] = [];
		let albumGenreChunk: Schema.AlbumGenre[] = [];
		const insertAlbums = async () => {
			let didInsert = false;
			if (albumChunk.length) {
				await this.db
					.insert(Schema.albums)
					.values(albumChunk)
					.onConflictDoUpdate({
						target: Schema.albums.id,
						set: {
							syncId: sql`excluded.sync_id`,
							title: sql`excluded.title`,
							displayArtist: sql`excluded.display_artist`,
							coverArt: sql`excluded.cover_art`,
							songCount: sql`excluded.song_count`,
							duration: sql`excluded.duration`,
							dateCreated: sql`excluded.date_created`,
							year: sql`excluded.year`,
							musicBrainzId: sql`excluded.musicbrainz_id`,
						},
					});
				albumChunk = [];
				didInsert = true;
			}
			if (albumArtistChunk.length) {
				await this.db
					.insert(Schema.albumArtists)
					.values(albumArtistChunk)
					.onConflictDoUpdate({
						target: [Schema.albumArtists.albumId, Schema.albumArtists.artistId],
						set: {
							albumId: sql`excluded.album_id`,
							artistId: sql`excluded.artist_id`,
							ordinal: sql`excluded.ordinal`,
							joinPhrase: sql`excluded.join_phrase`,
							syncId: sql`excluded.sync_id`,
						},
					});
				albumArtistChunk = [];
				didInsert = true;
			}
			if (genreChunk.length) {
				await this.db
					.insert(Schema.genres)
					.values(genreChunk)
					.onConflictDoUpdate({
						target: [Schema.genres.name],
						set: {
							name: sql`excluded.name`,
							syncId: sql`excluded.sync_id`,
						},
					});
				genreChunk = [];
				didInsert = true;
			}
			if (albumGenreChunk.length) {
				await this.db
					.insert(Schema.albumGenres)
					.values(albumGenreChunk)
					.onConflictDoUpdate({
						target: [Schema.albumGenres.albumId, Schema.albumGenres.name],
						set: {
							albumId: sql`excluded.album_id`,
							name: sql`excluded.name`,
							syncId: sql`excluded.sync_id`,
						},
					});
				albumGenreChunk = [];
				didInsert = true;
			}
			if (didInsert) {
				await yieldToEventLoop();
			}
		};

		await this.dataClient.forEachAlbumId(async (albumUuid) => {
			try {
				const album = await this.dataClient.getAlbum(albumUuid, {
					relations: {
						artists: {
							attributes: true,
						},
						attributes: true,
						identities: true,
						tracks: {
							attributes: true,
						},
					},
				});
				if (album) {
					albumChunk.push({ ...Formatter.toAlbum(album), syncId });

					if (album.artists?.length) {
						const entities: Schema.AlbumArtist[] = album.artists.map(
							(link) => ({
								albumId: link.albumUuid,
								artistId: link.artistUuid,
								ordinal: link.ordinal,
								joinPhrase: link.joinPhrase,
								syncId,
							}),
						);
						albumArtistChunk.push(...entities);
					}

					const genres = new Set<string>();
					for (const attribute of album.attributes ?? []) {
						if (attribute.key == "genre" && attribute.type == "string") {
							for (const value of attribute.values) {
								genres.add(value);
							}
						}
					}

					for (const genre of genres) {
						if (!completedGenres.has(genre)) {
							completedGenres.add(genre);
							genreChunk.push({ name: genre, syncId });
						}
						albumGenreChunk.push({
							albumId: album.uuid,
							name: genre,
							syncId,
						});
					}
				}
				if (albumChunk.length >= 10) {
					await insertAlbums();
				}
			} catch (e) {
				this.logger.error(`Failed to sync Album "${albumUuid}":`, e);
			} finally {
				this.logger.debug(
					`Syncing Albums (${++completedAlbums}/${totalAlbums})`,
				);
				onProgress(completedAlbums / totalAlbums / STEPS + 1 / STEPS);
			}
		});
		await insertAlbums();

		const handlerIds = this.dataClient.getLibraryHandlerIds();
		for (const [index, { pluginId, libraryId }] of handlerIds.entries()) {
			const total = await this.dataClient.getTrackCount(pluginId, libraryId);
			this.logger.debug(
				`Syncing Library "${libraryId}" from Plugin "${pluginId}" (${total} tracks)`,
			);

			const range = 1 / STEPS / handlerIds.length;
			const lowerBound = 2 / STEPS + range * index;

			let songChunk: Schema.Song[] = [];
			let songArtistChunk: Schema.SongArtist[] = [];
			let songGenreChunk: Schema.SongGenre[] = [];
			const insertTracks = async () => {
				let didInsert = false;
				if (songChunk.length) {
					await this.db
						.insert(Schema.songs)
						.values(songChunk)
						.onConflictDoUpdate({
							target: [Schema.songs.id],
							set: {
								syncId: sql`excluded.sync_id`,
								title: sql`excluded.title`,
								coverArt: sql`excluded.cover_art`,
								duration: sql`excluded.duration`,
								bitrate: sql`excluded.bitrate`,
								samplerate: sql`excluded.samplerate`,
								channels: sql`excluded.channels`,
								rating: sql`excluded.rating`,
								bpm: sql`excluded.bpm`,
								albumId: sql`excluded.album_id`,
								musicBrainzId: sql`excluded.musicbrainz_id`,
								trackNumber: sql`excluded.track_number`,
								discNumber: sql`excluded.disc_number`,
							},
						});
					songChunk = [];
					didInsert = true;
				}
				if (songArtistChunk.length) {
					await this.db
						.insert(Schema.songArtists)
						.values(songArtistChunk)
						.onConflictDoUpdate({
							target: [Schema.songArtists.songId, Schema.songArtists.artistId],
							set: {
								ordinal: sql`excluded.ordinal`,
								joinPhrase: sql`excluded.join_phrase`,
								syncId: sql`excluded.sync_id`,
							},
						});
					songArtistChunk = [];
					didInsert = true;
				}
				if (genreChunk.length) {
					await this.db
						.insert(Schema.genres)
						.values(genreChunk)
						.onConflictDoUpdate({
							target: [Schema.genres.name],
							set: {
								name: sql`excluded.name`,
								syncId: sql`excluded.sync_id`,
							},
						});
					genreChunk = [];
					didInsert = true;
				}
				if (songGenreChunk.length) {
					await this.db
						.insert(Schema.songGenres)
						.values(songGenreChunk)
						.onConflictDoUpdate({
							target: [Schema.songGenres.songId, Schema.songGenres.name],
							set: {
								songId: sql`excluded.song_id`,
								name: sql`excluded.name`,
								syncId: sql`excluded.sync_id`,
							},
						});
					songGenreChunk = [];
					didInsert = true;
				}
				if (didInsert) {
					await yieldToEventLoop();
				}
			};

			let completed = 0;
			await this.dataClient.forEachTrackId(
				pluginId,
				libraryId,
				async (trackId, trackUuid) => {
					try {
						const track = await this.dataClient.getTrack(
							pluginId,
							libraryId,
							trackId,
							{
								relations: {
									attributes: true,
									identities: true,
									artists: {
										attributes: true,
									},
									albums: {
										attributes: true,
									},
								},
							},
						);
						if (track) {
							const songs: Schema.Song[] = Formatter.toSong(track).map(
								(song) => ({ ...song, syncId }),
							);
							songChunk.push(...songs);

							if (track.artists?.length) {
								for (const song of songs) {
									const links: Schema.SongArtist[] = track.artists.map(
										(link) => ({
											songId: song.id,
											artistId: link.artistUuid,
											ordinal: link.ordinal,
											joinPhrase: link.joinPhrase,
											syncId,
										}),
									);
									songArtistChunk.push(...links);
								}
							}

							const genres = new Set<string>();
							for (const attribute of track.attributes ?? []) {
								if (attribute.key == "genre" && attribute.type == "string") {
									for (const value of attribute.values) {
										genres.add(value);
									}
								}
							}

							for (const genre of genres) {
								if (!completedGenres.has(genre)) {
									completedGenres.add(genre);
									genreChunk.push({ name: genre, syncId });
								}
								for (const song of songs) {
									songGenreChunk.push({
										songId: song.id,
										name: genre,
										syncId,
									});
								}
							}
						}
						if (songChunk.length >= 10) {
							await insertTracks();
						}
					} catch (e) {
						this.logger.error(
							`Failed to sync Track "${trackId}" in Library "${libraryId}" from Plugin "${pluginId}":`,
							e,
						);
					} finally {
						this.logger.debug(
							`Syncing Library "${libraryId}" from Plugin "${pluginId}" (${++completed}/${total} tracks)`,
						);
						onProgress(lowerBound + (range / total) * completed);
					}
				},
			);
			await insertTracks();
		}

		// const totalUsers = await this.dataClient.getUserCount();

		const SAVED_CHUNK = 1000;

		await this.dataClient.forEachUserId(async (userId) => {
			for (let i = 0; true; i++) {
				const chunk = await this.dataClient.getSavedTrackUuids(
					userId,
					SAVED_CHUNK,
					i * SAVED_CHUNK,
				);

				if (chunk.length) {
					await this.db
						.insert(Schema.songSaves)
						.values(
							chunk.map(({ uuid, dateSaved }) => ({
								songId: uuid,
								userId,
								syncId,
								dateSaved: dateSaved.getTime(),
							})),
						)
						.onConflictDoUpdate({
							target: [Schema.songSaves.songId, Schema.songSaves.userId],
							set: {
								syncId: sql`excluded.sync_id`,
								dateSaved: sql`excluded.date_saved`,
							},
						});
				}
				if (chunk.length < SAVED_CHUNK) {
					break;
				}
			}

			for (let i = 0; true; i++) {
				const chunk = await this.dataClient.getSavedAlbumUuids(
					userId,
					SAVED_CHUNK,
					i * SAVED_CHUNK,
				);

				if (chunk.length) {
					await this.db
						.insert(Schema.albumSaves)
						.values(
							chunk.map(({ uuid, dateSaved }) => ({
								albumId: uuid,
								userId,
								syncId,
								dateSaved: dateSaved.getTime(),
							})),
						)
						.onConflictDoUpdate({
							target: [Schema.albumSaves.albumId, Schema.albumSaves.userId],
							set: {
								syncId: sql`excluded.sync_id`,
								dateSaved: sql`excluded.date_saved`,
							},
						});
				}
				if (chunk.length < SAVED_CHUNK) {
					break;
				}
			}

			for (let i = 0; true; i++) {
				const chunk = await this.dataClient.getSavedArtistUuids(
					userId,
					SAVED_CHUNK,
					i * SAVED_CHUNK,
				);

				if (chunk.length) {
					await this.db
						.insert(Schema.artistSaves)
						.values(
							chunk.map(({ uuid, dateSaved }) => ({
								artistId: uuid,
								userId,
								syncId,
								dateSaved: dateSaved.getTime(),
							})),
						)
						.onConflictDoUpdate({
							target: [Schema.artistSaves.artistId, Schema.artistSaves.userId],
							set: {
								syncId: sql`excluded.sync_id`,
								dateSaved: sql`excluded.date_saved`,
							},
						});
				}
				if (chunk.length < SAVED_CHUNK) {
					break;
				}
			}
		});

		await this.db
			.delete(Schema.albumArtists)
			.where(ne(Schema.albumArtists.syncId, syncId));
		await yieldToEventLoop();
		await this.db
			.delete(Schema.songArtists)
			.where(ne(Schema.songArtists.syncId, syncId));
		await yieldToEventLoop();
		await this.db
			.delete(Schema.albumGenres)
			.where(ne(Schema.albumGenres.syncId, syncId));
		await yieldToEventLoop();
		await this.db
			.delete(Schema.songGenres)
			.where(ne(Schema.songGenres.syncId, syncId));
		await yieldToEventLoop();
		await this.db.delete(Schema.songs).where(ne(Schema.songs.syncId, syncId));
		await yieldToEventLoop();
		await this.db
			.delete(Schema.albums)
			.where(ne(Schema.albums.syncId, syncId));
		await yieldToEventLoop();
		await this.db
			.delete(Schema.artists)
			.where(ne(Schema.artists.syncId, syncId));
		await yieldToEventLoop();
		await this.db
			.delete(Schema.genres)
			.where(ne(Schema.genres.syncId, syncId));
		await this.db
			.delete(Schema.songSaves)
			.where(ne(Schema.songSaves.syncId, syncId));
		await this.db
			.delete(Schema.artistSaves)
			.where(ne(Schema.artistSaves.syncId, syncId));
		await this.db
			.delete(Schema.albumSaves)
			.where(ne(Schema.albumSaves.syncId, syncId));
	}
}
