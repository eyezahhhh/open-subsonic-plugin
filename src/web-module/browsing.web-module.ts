import { formatAlbum, formatArtist, formatSong } from "../formatter.js";
import { ErrCode, SubsonicError } from "../subsonic.error.js";
import { ArtistID3, IndexID3 } from "../types.js";
import { CreateEndpointFunction, WebModule } from "./web-module.js";
import * as schema from "../db/schema.js";
import { eq, sql } from "drizzle-orm";

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
						},
					},
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
				},
			});

			if (!song) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Track not found");
			}

			return {
				song: formatSong(song),
			};
		});
	}
}
