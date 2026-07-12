import { DataClient, Logger, SavedAttribute } from "@sdk";
import { DBClient } from "./client.js";
import { randomUUID } from "crypto";
import Formatter from "./db-formatter.js";
import * as Schema from "./schema.js";
import { eq, ne, sql } from "drizzle-orm";

export class DatabaseManager {
	private syncId = randomUUID();

	constructor(
		private readonly db: DBClient,
		private readonly dataClient: DataClient,
		private readonly logger: Logger,
	) {}

	getClient() {
		return this.db;
	}

	async sync(onlyNew: boolean, onProgress: (fraction: number) => void) {
		const STEPS = 3;

		const syncId = randomUUID();
		this.syncId = syncId;

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
			}
		};

		await this.dataClient.forEachArtistId(async (artistUuid) => {
			try {
				if (onlyNew) {
					const exists = await this.db.query.artists.findFirst({
						where: eq(Schema.artists.id, artistUuid),
						columns: {
							id: true,
						},
					});
					if (exists) {
						return;
					}
				}

				const artist = await this.dataClient.getArtist(artistUuid, {
					relations: {
						albums: true,
						attributes: true,
						identities: true,
					},
				});

				if (artist) {
					const entity: Schema.Artist = {
						...Formatter.toArtist(artist),
						syncId,
					};
					artistChunk.push(entity);
					if (artistChunk.length >= 100) {
						await insertArtists();
					}
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
			}
		};

		await this.dataClient.forEachAlbumId(async (albumUuid) => {
			try {
				if (onlyNew) {
					const exists = await this.db.query.albums.findFirst({
						where: eq(Schema.albums.id, albumUuid),
						columns: {
							id: true,
						},
					});
					if (exists) {
						return;
					}
				}

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
					const entity: Schema.Album = { ...Formatter.toAlbum(album), syncId };
					albumChunk.push(entity);

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

					if (
						albumChunk.length >= 100 ||
						albumArtistChunk.length >= 100 ||
						albumGenreChunk.length >= 100 ||
						genreChunk.length >= 100
					) {
						await insertAlbums();
					}
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
				}
			};

			let completed = 0;
			await this.dataClient.forEachTrackId(
				pluginId,
				libraryId,
				async (trackId, trackUuid) => {
					try {
						if (onlyNew) {
							const exists = await this.db.query.songs.findFirst({
								where: eq(Schema.songs.originalUuid, trackUuid),
								columns: {
									id: true,
								},
							});
							if (exists) {
								return;
							}
						}

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

							if (
								songChunk.length >= 100 ||
								songArtistChunk.length >= 100 ||
								songGenreChunk.length >= 100 ||
								genreChunk.length >= 100
							) {
								await insertTracks();
							}
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

		if (!onlyNew) {
			await this.db.delete(Schema.songs).where(ne(Schema.songs.syncId, syncId));
			await this.db
				.delete(Schema.albums)
				.where(ne(Schema.albums.syncId, syncId));
			await this.db
				.delete(Schema.artists)
				.where(ne(Schema.artists.syncId, syncId));
			await this.db
				.delete(Schema.albumArtists)
				.where(ne(Schema.albumArtists.syncId, syncId));
			await this.db
				.delete(Schema.songArtists)
				.where(ne(Schema.songArtists.syncId, syncId));
			await this.db
				.delete(Schema.genres)
				.where(ne(Schema.genres.syncId, syncId));
			await this.db
				.delete(Schema.albumGenres)
				.where(ne(Schema.albumGenres.syncId, syncId));
			await this.db
				.delete(Schema.songGenres)
				.where(ne(Schema.songGenres.syncId, syncId));
		}
	}
}
