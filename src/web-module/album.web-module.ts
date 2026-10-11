import { ErrCode, SubsonicError } from "../subsonic.error.js";
import { CreateEndpointFunction, WebModule } from "./web-module.js";
import { sql, exists, and, desc, eq } from "drizzle-orm";
import { formatAlbum, formatAlbumChild, formatArtist, formatSong } from "../formatter.js";
import { randomUUID } from "crypto";
import * as Schema from "../db/schema.js";
import { DatabaseManager } from "../db/database-manager.js";

export class AlbumWebModule extends WebModule {
	private randomSeed = randomUUID();

	constructor() {
		super();

		setInterval(() => {
			this.randomSeed = randomUUID();
		}, 60_000 * 10);
	}

	bind(endpoint: CreateEndpointFunction): void {
		endpoint("getAlbumList2", async ({ param, db, userId }) => {
			const type = param("type");
			const sizeString = param("size");
			const offsetString = param("offset");
			if (!type) {
				throw new SubsonicError(
					ErrCode.REQUIRED_PARAM_MISSING,
					"Missing parameter",
				);
			}
			if (
				![
					"random",
					"newest",
					"highest",
					"frequent",
					"recent",
					"alphabeticalByName",
					"alphabeticalByArtist",
					"starred",
					"byYear",
					"byGenre",
				].includes(type)
			) {
				throw new SubsonicError(ErrCode.GENERIC, "Invalid type");
			}
			let size = 20;
			let offset = 0;
			if (sizeString) {
				const sizeNum = parseInt(sizeString);
				if (!isNaN(sizeNum) && sizeNum > 0) {
					size = sizeNum;
				}
			}
			if (offsetString) {
				const offsetNum = parseInt(offsetString);
				if (!isNaN(offsetNum) && offsetNum >= 0) {
					offset = offsetNum;
				}
			}

			const albumsQuery = db.getClient().query.albums;
			const queryConfig: Parameters<typeof albumsQuery.findMany>[0] = {};

			if (type == "byGenre") {
				const genre = param("genre");
				if (genre) {
					queryConfig.where = exists(
						db
							.getClient()
							.select()
							.from(Schema.albumGenres)
							.where(
								and(
									eq(Schema.albumGenres.albumId, Schema.albums.id),
									eq(Schema.albumGenres.name, genre),
								),
							),
					);
				}
			}

			queryConfig.orderBy = (albums, { asc, desc }) => {
				switch (type) {
					case "random":
						return [asc(sql`seeded_random(${albums.id}, ${this.randomSeed})`)];

					case "newest":
						return [desc(albums.dateCreated)];

					case "alphabeticalByName":
						return [asc(sql`${albums.title} COLLATE NOCASE`)];

					case "alphabeticalByArtist":
						return [asc(sql`${albums.displayArtist} COLLATE NOCASE`)];

					case "byYear":
						return [
							desc(albums.year),
							asc(sql`${albums.title} COLLATE NOCASE`),
						];

					case "highest":
					case "frequent":
					case "recent":
					case "starred":
					case "byGenre":
					default:
						return [];
				}
			};

			const albumResponse = await db
				.getClient()
				.query.albums.findMany({
					...queryConfig,
					offset,
					limit: size,
					with: {
						saves: {
							where: eq(Schema.albumSaves.userId, userId),
						},
						albumArtists: {
							with: {
								artist: {
									with: {
										saves: {
											where: eq(Schema.artistSaves.userId, userId),
										},
									},
								},
							},
						},
						albumGenres: true,
					},
				})
				.execute();

			const response = {
				albumList2: {
					album: albumResponse.map(formatAlbum),
				},
			};
			return response;
		});

		endpoint("getStarred", async ({ db, userId }) => {
			const { artistSaves, albumSaves, songSaves } = await this.fetchStarred(
				db,
				userId,
			);

			return {
				starred: {
					artist: artistSaves
						.filter((save) => !!save.artist)
						.map((save) => formatArtist(save.artist!)),
					album: albumSaves
						.filter((save) => !!save.album)
						.map((save) => formatAlbumChild(save.album!)),
					song: songSaves
						.filter((save) => !!save.song)
						.map((save) => formatSong(save.song!)),
				},
			};
		});

		endpoint("getStarred2", async ({ db, userId }) => {
			const { artistSaves, albumSaves, songSaves } = await this.fetchStarred(
				db,
				userId,
			);

			return {
				starred2: {
					artist: artistSaves
						.filter((save) => !!save.artist)
						.map((save) => formatArtist(save.artist!)),
					album: albumSaves
						.filter((save) => !!save.album)
						.map((save) => formatAlbum(save.album!)),
					song: songSaves
						.filter((save) => !!save.song)
						.map((save) => formatSong(save.song!)),
				},
			};
		});

		endpoint("getSongsByGenre", async ({ param, db, userId }) => {
			const genre = param("genre");
			if (!genre) {
				throw new SubsonicError(
					ErrCode.REQUIRED_PARAM_MISSING,
					"Genre not specified",
				);
			}

			let count = 10;
			const countString = Number(param("count"));
			if (
				Number.isInteger(countString) &&
				countString > 0 &&
				countString <= 500
			) {
				count = countString;
			}

			let offset = 0;
			const offsetString = Number(param("offset"));
			if (Number.isInteger(offsetString) && offsetString > 0) {
				offset = offsetString;
			}

			const songs = await db.getClient().query.songs.findMany({
				where: exists(
					db
						.getClient()
						.select()
						.from(Schema.songGenres)
						.where(
							and(
								eq(Schema.songGenres.songId, Schema.songs.id),
								eq(Schema.songGenres.name, genre),
							),
						),
				),
				with: {
					saves: {
						where: eq(Schema.songSaves.userId, userId),
					},
					album: true,
					songArtists: {
						with: {
							artist: {
								with: {
									saves: {
										where: eq(Schema.artistSaves.userId, userId),
									},
								},
							},
						},
					},
					songGenres: true,
				},
				limit: count,
				offset,
			});

			return {
				songsByGenre: {
					song: songs.map(formatSong),
				},
			};
		});
	}

	private async fetchStarred(db: DatabaseManager, userId: string) {
		const [artistSaves, albumSaves, songSaves] = await Promise.all([
			db.getClient().query.artistSaves.findMany({
				where: eq(Schema.artistSaves.userId, userId),
				orderBy: desc(Schema.artistSaves.dateSaved),
				with: {
					artist: {
						with: {
							saves: {
								where: eq(Schema.artistSaves.userId, userId),
							},
						},
					},
				},
			}),
			db.getClient().query.albumSaves.findMany({
				where: eq(Schema.albumSaves.userId, userId),
				orderBy: desc(Schema.albumSaves.dateSaved),
				with: {
					album: {
						with: {
							saves: {
								where: eq(Schema.albumSaves.userId, userId),
							},
							albumArtists: {
								with: {
									artist: {
										with: {
											saves: {
												where: eq(Schema.artistSaves.userId, userId),
											},
										},
									},
								},
							},
							albumGenres: true,
						},
					},
				},
			}),
			db.getClient().query.songSaves.findMany({
				where: eq(Schema.songSaves.userId, userId),
				orderBy: desc(Schema.songSaves.dateSaved),
				with: {
					song: {
						with: {
							saves: {
								where: eq(Schema.songSaves.userId, userId),
							},
							album: true,
							songArtists: {
								with: {
									artist: {
										with: {
											saves: {
												where: eq(Schema.artistSaves.userId, userId),
											},
										},
									},
								},
							},
							songGenres: true,
						},
					},
				},
			}),
		]);

		return { artistSaves, albumSaves, songSaves };
	}
}
