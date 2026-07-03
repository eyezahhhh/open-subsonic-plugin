import { formatAlbum, formatArtist, formatSong } from "../formatter.js";
import { ErrCode, SubsonicError } from "../subsonic.error.js";
import { ArtistID3, IndexID3 } from "../types.js";
import { CreateEndpointFunction, WebModule } from "./web-module.js";
import * as schema from "../db/schema.js";
import { eq, sql, asc } from "drizzle-orm";

export class BrowsingWebModule extends WebModule {
	bind(endpoint: CreateEndpointFunction): void {
		endpoint("getMusicFolders", () => {
			return {
				musicFolders: {
					musicFolder: [
						{
							id: 1,
							name: "Main Library",
						},
					],
				},
			};
		});

		endpoint("getMusicDirectory", async ({ param }) => {
			const id = param("id");
			// console.log({ id });
		});

		endpoint("getArtists", async ({ db }) => {
			const response: schema.Artist[] = await db
				.getClient()
				.select()
				.from(schema.artists)
				.orderBy(sql`${schema.artists.name} COLLATE NOCASE ASC`);

			const groups: Record<string, ArtistID3[]> = {};
			for (const entry of response) {
				let firstLetter = entry.name.charAt(0).toUpperCase();
				if (!firstLetter) {
					firstLetter = "#";
				}
				if (!/[A-Z]/.test(firstLetter)) {
					firstLetter = "#";
				}
				if (groups[firstLetter]) {
					groups[firstLetter]?.push(formatArtist(entry));
				} else {
					groups[firstLetter] = [formatArtist(entry)];
				}
			}

			const index: IndexID3[] = [];
			for (const [key, group] of Object.entries(groups)) {
				group.sort((a, b) => a.name.localeCompare(b.name));
				index.push({
					name: key,
					artist: group,
				});
			}
			index.sort((a, b) => a.name.localeCompare(b.name));
			return {
				artists: {
					ignoredArticles: "",
					index,
				},
			};
		});

		endpoint("getArtist", async ({ param, db }) => {
			const id = param("id");
			if (!id) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Artist ID not specified");
			}

			const artist = await db.getClient().query.artists.findFirst({
				where: eq(schema.artists.id, id),
				with: {
					albumArtists: {
						with: {
							album: {
								with: {
									albumArtists: {
										with: {
											artist: true,
										},
									},
								},
							},
						},
					},
				},
			});

			if (!artist) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Artist not found");
			}

			return {
				artist: formatArtist(artist),
			};
		});

		endpoint("getAlbum", async ({ param, db }) => {
			const id = param("id");
			if (!id) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Album ID not specified");
			}

			const album = await db.getClient().query.albums.findFirst({
				where: eq(schema.albums.id, id),
				with: {
					albumArtists: {
						with: {
							artist: true,
						},
					},
					songs: {
						with: {
							songArtists: {
								with: {
									artist: true,
								},
							},
							album: true,
							songGenres: true,
						},
					},
					albumGenres: true,
				},
			});

			if (!album) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Album not found");
			}

			return {
				album: formatAlbum(album),
			};
		});

		endpoint("getSong", async ({ param, db }) => {
			const id = param("id");
			if (!id) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Track ID not specified");
			}

			const song = await db.getClient().query.songs.findFirst({
				where: eq(schema.songs.id, id),
				with: {
					songArtists: {
						with: {
							artist: true,
						},
					},
					album: true,
					songGenres: true,
				},
			});

			if (!song) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Track not found");
			}

			return {
				song: formatSong(song),
			};
		});

		endpoint("getGenres", async ({ db }) => {
			const albumCountsSq = db
				.getClient()
				.select({
					genreName: schema.albumGenres.name,
					count: sql<number>`count(*)`.as("album_count"),
				})
				.from(schema.albumGenres)
				.groupBy(schema.albumGenres.name)
				.as("album_counts_sq");

			const songCountsSq = db
				.getClient()
				.select({
					genreName: schema.songGenres.name,
					count: sql<number>`count(*)`.as("song_count"),
				})
				.from(schema.songGenres)
				.groupBy(schema.songGenres.name)
				.as("song_counts_sq");

			const genres = await db
				.getClient()
				.select({
					value: schema.genres.name,
					albumCount: sql<number>`coalesce(${albumCountsSq.count}, 0)`,
					songCount: sql<number>`coalesce(${songCountsSq.count}, 0)`,
				})
				.from(schema.genres)
				.leftJoin(
					albumCountsSq,
					eq(schema.genres.name, albumCountsSq.genreName),
				)
				.leftJoin(songCountsSq, eq(schema.genres.name, songCountsSq.genreName))
				.orderBy(asc(sql`${schema.genres.name} collate nocase`));

			return {
				genres: {
					genre: genres,
				},
			};
		});
	}
}
