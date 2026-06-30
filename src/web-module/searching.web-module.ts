import { like } from "drizzle-orm";
import { CreateEndpointFunction, WebModule } from "./web-module.js";
import { SearchResult3 } from "../types.js";
import { formatAlbum, formatArtist, formatSong } from "../formatter.js";
import * as Schema from "../db/schema.js";

export class SearchingWebModule extends WebModule {
	bind(endpoint: CreateEndpointFunction): void {
		endpoint("search", async ({ userId, queryParams }) => {
			console.log("search", userId, queryParams);
		});

		endpoint("search2", async ({ userId, queryParams }) => {
			console.log("search2", userId, queryParams);
		});

		endpoint("search3", async ({ userId, queryParams, param, db }) => {
			console.log("search3", userId, queryParams);

			let query = param("query");
			if (query == `""`) {
				query = "";
			}

			const artistCount = this.int(param("artistCount"), 20);
			const artistOffset = this.int(param("artistOffset"), 0);
			const albumCount = this.int(param("albumCount"), 20);
			const albumOffset = this.int(param("albumOffset"), 0);
			const songCount = this.int(param("songCount"), 20);
			const songOffset = this.int(param("songOffset"), 0);

			const response: SearchResult3 = {
				artist: [],
				album: [],
				song: [],
			};

			if (artistCount) {
				const artists = await db.getClient().query.artists.findMany({
					where: query?.length
						? like(Schema.artists.name, `%${query}%`)
						: undefined,
					limit: artistCount,
					offset: artistOffset,
				});
				response.artist = artists.map(formatArtist);
			}

			if (albumCount) {
				const albums = await db.getClient().query.albums.findMany({
					where: query ? like(Schema.albums.title, `%${query}%`) : undefined,
					with: {
						albumArtists: {
							with: {
								artist: true,
							},
						},
					},
					limit: albumCount,
					offset: albumOffset,
				});
				response.album = albums.map(formatAlbum);
			}

			if (songCount) {
				const songs = await db.getClient().query.songs.findMany({
					where: query ? like(Schema.songs.title, `%${query}%`) : undefined,
					with: {
						songArtists: {
							with: {
								artist: true,
							},
						},
						album: {
							with: {
								albumArtists: true,
							},
						},
					},
					limit: songCount,
					offset: songOffset,
				});
				response.song = songs.map(formatSong);
			}

			return {
				searchResult3: response,
			};
		});
	}

	private int<T extends number | undefined>(
		string: string | null,
		fallback?: T,
	): T extends number ? number : number | null {
		if (string) {
			const int = Number(string);
			if (Number.isInteger(int)) {
				return int;
			}
		}

		return fallback ?? (null as any);
	}
}
