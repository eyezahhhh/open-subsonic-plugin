import { AttributeValue, PlaylistClient, SavedPlaylistTrack } from "@sdk";
import { CreateEndpointFunction, WebModule } from "./web-module.js";
import { Playlist } from "../types.js";
import { ErrCode, SubsonicError } from "../subsonic.error.js";
import { formatPlaylist } from "../formatter.js";
import { DatabaseManager } from "../db/database-manager.js";
import { inArray } from "drizzle-orm";
import * as Schema from "../db/schema.js";

export class PlaylistsWebModule extends WebModule {
	constructor(private readonly playlistClient: PlaylistClient) {
		super();
	}

	private async convertTracklist(
		tracks: SavedPlaylistTrack[],
		db: DatabaseManager,
	) {
		if (!tracks.length) {
			return [];
		}

		const allSongs: (Schema.Song | null)[] = Array(tracks.length).fill(null);
		const indexes = new Map<string, number>();

		const chunks: SavedPlaylistTrack[][] = [];
		for (let i = 0; i < tracks.length; i += 500) {
			const chunk = tracks.slice(i, i + 500);
			chunks.push(chunk);

			for (const [index, track] of chunk.entries()) {
				indexes.set(track.trackUuid, i + index);
			}
		}

		for (const chunk of chunks) {
			const songs: Schema.Song[] = await db.getClient().query.songs.findMany({
				where: inArray(
					Schema.songs.originalUuid,
					chunk.map((entry) => entry.trackUuid),
				),
				with: {
					album: true,
					songArtists: {
						with: {
							artist: true,
						},
					},
				},
			});

			for (const song of songs) {
				const index = indexes.get(song.originalUuid);
				if (index === undefined) {
					continue;
				}
				allSongs[index] = song;
				indexes.delete(song.originalUuid);
			}
		}

		for (const [index, song] of allSongs.entries()) {
			if (!song) {
				const track = tracks[index];
				console.log(
					`Failed to find song for track "${track?.trackUuid ?? "UNKNOWN"}"`,
				);
			}
		}

		return allSongs.filter((song) => !!song);
	}

	bind(endpoint: CreateEndpointFunction): void {
		const getPlaylist = async (id: string | null, userId?: string) => {
			if (!id) {
				throw new SubsonicError(
					ErrCode.REQUIRED_PARAM_MISSING,
					"No ID specified",
				);
			}
			const playlist = await this.playlistClient.getPlaylist(id, {
				relations: {
					attributes: true,
					owner: true,
					tracks: true,
				},
			});
			if (!playlist) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Playlist not found");
			}
			if (userId && playlist.ownerUuid != userId) {
				throw new SubsonicError(ErrCode.UNAUTHORIZED_USER, "Unauthorized");
			}
			return playlist;
		};

		endpoint("getPlaylists", async ({ userId }) => {
			const playlistIds =
				await this.playlistClient.getUserPlaylistUuids(userId);
			const playlists = await Promise.allSettled(
				playlistIds.map((id) =>
					this.playlistClient.getPlaylist(id, {
						relations: {
							owner: true,
							attributes: true,
							tracks: true,
						},
					}),
				),
			);
			const entries: Playlist[] = playlists.map((response, index) => {
				if (response.status == "fulfilled" && response.value) {
					return formatPlaylist(response.value);
				}
				return {
					id: playlistIds[index]!,
					name: "Unknown Playlist",
					songCount: 0,
					duration: 0,
					created: new Date(0).toISOString(),
					changed: new Date(0).toISOString(),
				};
			});
			return {
				playlists: {
					playlist: entries,
				},
			};
		});

		endpoint("getPlaylist", async ({ userId, param, db }) => {
			const id = param("id");
			const playlist = await getPlaylist(id, userId);

			const songs = await this.convertTracklist(playlist.tracks ?? [], db);

			return {
				playlist: formatPlaylist(playlist, songs),
			};
		});

		endpoint("updatePlaylist", async ({ userId, param, db }) => {
			const id = param("playlistId");
			const playlist = await getPlaylist(id, userId);

			const toRemove = param("songIndexToRemove", true);
			const toAdd = param("songIdToAdd", true);

			if (toRemove.length) {
				const removalIndexes = toRemove
					.map((index) => Number(index))
					.filter((index) => Number.isInteger(index));

				const removalEntries = playlist.tracks?.filter((_, index) =>
					removalIndexes.includes(index),
				);

				if (removalEntries?.length) {
					await this.playlistClient.removeFromPlaylist(
						playlist.uuid,
						removalEntries.map((entry) => entry.trackUuid),
						{
							asUser: userId,
						},
					);
				}
			}

			await this.addSongs(db, playlist.uuid, toAdd, userId);

			// todo: allow changing playlist name
		});

		endpoint("createPlaylist", async ({ userId, param, queryParams, db }) => {
			const id = param("playlistId");

			const attributes: AttributeValue[] = [];
			const name = param("name");
			if (name) {
				attributes.push({
					key: "title",
					value: name,
				});
			}

			let playlistId: string;

			if (id) {
				const playlist = await getPlaylist(id, userId);
				if (!playlist) {
					throw new SubsonicError(ErrCode.NOT_FOUND, "Playlist not found");
				}
				if (userId && playlist.ownerUuid != userId) {
					throw new SubsonicError(ErrCode.UNAUTHORIZED_USER, "Unauthorized");
				}
				playlistId = playlist.uuid;
			} else {
				playlistId = await this.playlistClient.createUserPlaylist(userId, {
					attributes,
				});
			}

			const songIds = param("songId", true);
			await this.addSongs(db, playlistId, songIds, userId);

			const playlist = await getPlaylist(playlistId, userId);
			const songs = await this.convertTracklist(playlist.tracks ?? [], db);

			return {
				playlist: formatPlaylist(playlist, songs),
			};
		});

		endpoint("deletePlaylist", async ({ db, param, userId }) => {
			const id = param("id");
			const playlist = await getPlaylist(id, userId);
			await this.playlistClient.deletePlaylist(playlist.uuid, {
				asUser: userId,
			});
		});
	}

	private async addSongs(
		db: DatabaseManager,
		playlistId: string,
		songIds: string[],
		userId?: string,
	) {
		if (!songIds.length) {
			return;
		}
		const songOrder: ({ id: string; originalUuid: string } | null)[] = Array(
			songIds.length,
		).fill(null);
		const indexes = new Map<string, number>();
		for (const [index, id] of songIds.entries()) {
			indexes.set(id, index);
		}

		const songs = await db.getClient().query.songs.findMany({
			where: inArray(Schema.songs.id, songIds),
			columns: {
				id: true,
				originalUuid: true,
			},
		});

		for (const song of songs) {
			const index = indexes.get(song.id);
			if (index !== undefined) {
				songOrder[index] = song;
			}
		}

		const finalSongs = songOrder
			.filter((entry) => !!entry)
			.map((entry) => entry.originalUuid);
		if (finalSongs.length) {
			await this.playlistClient.addToPlaylist(playlistId, finalSongs, {
				asUser: userId,
			});
		}
	}
}
