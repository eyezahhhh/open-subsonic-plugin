import { DataClient } from "@sdk";
import { ErrCode, SubsonicError } from "../subsonic.error.js";
import { CreateEndpointFunction, WebModule } from "./web-module.js";
import { createAttributeRecord, getAttributeValue, shuffle } from "../util.js";
import { formatAlbum, getArtistString } from "../formatter.js";

export class AlbumWebModule extends WebModule {
	bind(endpoint: CreateEndpointFunction): void {
		endpoint("getAlbumList2", async ({ queryParams, dataClient }) => {
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

			let allAlbums = await this.getAllAlbums(dataClient);

			switch (type) {
				case "random":
					shuffle(allAlbums);
					break;
				case "newest":
					allAlbums.sort(
						(a, b) => b.dateAdded.getTime() - a.dateAdded.getTime(),
					);
					break;
				case "alphabeticalByName": {
					const albumNames = allAlbums.map((album) => ({
						album,
						name:
							getAttributeValue(album.attributes, "title", "string") ??
							"Unknown Artist",
					}));
					albumNames.sort((a, b) => a.name.localeCompare(b.name));
					allAlbums = albumNames.map(({ album }) => album);
					break;
				}
				case "alphabeticalByArtist": {
					const albumNames = allAlbums.map((album) => ({
						album,
						name:
							getArtistString(
								album.artists,
								createAttributeRecord(album.attributes ?? []),
							) ?? "Unknown Artist",
					}));
					albumNames.sort((a, b) => a.name.localeCompare(b.name));
					allAlbums = albumNames.map(({ album }) => album);
					break;
				}
				case "byYear": {
					const { fromYear: fromYearString, toYear: toYearString } =
						queryParams;
					if (!fromYearString || !toYearString) {
						throw new SubsonicError(
							ErrCode.REQUIRED_PARAM_MISSING,
							"Missing parameter",
						);
					}

					let fromYear = parseInt(fromYearString);
					let toYear = parseInt(toYearString);
					if (isNaN(fromYear) || isNaN(toYear) || fromYear < 0 || toYear < 0) {
						throw new SubsonicError(ErrCode.GENERIC, "Invalid year");
					}
					const reverse = fromYear > toYear;
					if (reverse) {
						[fromYear, toYear] = [toYear, fromYear];
					}

					const albumYears = allAlbums
						.map((album) => ({
							album,
							year: getAttributeValue(album.attributes, "year", "integer"),
						}))
						.filter(({ year }) => year && year >= fromYear && year <= toYear);
					albumYears.sort((a, b) =>
						reverse ? b.year! - a.year! : a.year! - b.year!,
					);

					allAlbums = albumYears.map(({ album }) => album);
					break;
				}
			}

			const response = {
				albumList2: {
					album: allAlbums.slice(offset, offset + size).map(formatAlbum),
				},
			};

			return response;
		});
	}

	private async getAllAlbums(dataClient: DataClient) {
		const albumUuids: string[] = [];
		await dataClient.forEachAlbum((uuid) => {
			albumUuids.push(uuid);
		});
		const albumResponses = await Promise.allSettled(
			albumUuids.map((uuid) =>
				dataClient.getAlbum(uuid, {
					relations: {
						identities: true,
						attributes: true,
						artists: {
							attributes: true,
						},
					},
				}),
			),
		);
		return albumResponses
			.filter((response) => response.status == "fulfilled")
			.map((response) => response.value)
			.filter((album) => !!album);
	}
}
