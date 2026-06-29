import { ErrCode, SubsonicError } from "../subsonic.error.js";
import { CreateEndpointFunction, WebModule } from "./web-module.js";
import { sql } from "drizzle-orm";
import { formatAlbum } from "../formatter.js";
import { randomUUID } from "crypto";

export class AlbumWebModule extends WebModule {
	private randomSeed = randomUUID();

	constructor() {
		super();

		setInterval(() => {
			this.randomSeed = randomUUID();
		}, 60_000 * 10);
	}

	bind(endpoint: CreateEndpointFunction): void {
		endpoint("getAlbumList2", async ({ queryParams, db }) => {
			const { type, size: sizeString, offset: offsetString } = queryParams;
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
						albumArtists: {
							with: {
								artist: true,
							},
						},
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
	}
}
