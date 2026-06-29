import { formatAlbum, formatArtist, formatTrack } from "../formatter.js";
import { ErrCode, SubsonicError } from "../subsonic.error.js";
import { ArtistID3, IndexID3 } from "../types.js";
import { parseTrackId } from "../util.js";
import { CreateEndpointFunction, WebModule } from "./web-module.js";

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

		endpoint("getArtists", async ({ dataClient }) => {
			const artistUuids: string[] = [];
			await dataClient.forEachArtist((uuid) => {
				artistUuids.push(uuid);
			});
			const artistResponses = await Promise.allSettled(
				artistUuids.map((uuid) =>
					dataClient.getArtist(uuid, {
						relations: {
							identities: true,
							attributes: true,
							albums: true,
						},
					}),
				),
			);

			const artistEntries: ArtistID3[] = [];

			for (const [index, id] of artistUuids.entries()) {
				const response = artistResponses[index];
				if (response?.status == "fulfilled") {
					if (response.value) {
						artistEntries.push(formatArtist(response.value));
						continue;
					}
				}

				artistEntries.push({
					id,
					name: "Unknown Artist",
					albumCount: 0,
					musicBrainzId: "",
					artistImageUrl: "",
					coverArt: "",
				});
			}

			const groups: Record<string, ArtistID3[]> = {};
			for (const entry of artistEntries) {
				let firstLetter = entry.name.charAt(0).toUpperCase();

				if (!firstLetter) {
					firstLetter = "#";
				}

				if (!/[A-Z]/.test(firstLetter)) {
					firstLetter = "#";
				}

				if (groups[firstLetter]) {
					groups[firstLetter]?.push(entry);
				} else {
					groups[firstLetter] = [entry];
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

		endpoint("getArtist", async ({ queryParams, dataClient }) => {
			const { id } = queryParams;
			if (!id) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Artist ID not specified");
			}

			const artist = await dataClient.getArtist(id, {
				relations: {
					attributes: true,
					albums: {
						artists: {
							attributes: true,
						},
						attributes: true,
						tracks: {
							attributes: true,
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

		endpoint("getAlbum", async ({ queryParams, dataClient }) => {
			const { id } = queryParams;
			if (!id) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Album ID not specified");
			}

			const album = await dataClient.getAlbum(id, {
				relations: {
					attributes: true,
					artists: {
						attributes: true,
						identities: true,
					},
					tracks: {
						artists: {
							attributes: true,
							identities: true,
						},
						attributes: true,
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

		endpoint("getSong", async ({ queryParams, dataClient }) => {
			const { id } = queryParams;
			if (!id) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Track ID not specified");
			}

			const fullId = parseTrackId(id);
			if (!fullId) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Invalid track ID");
			}
			const { pluginId, libraryId, trackId } = fullId;

			const track = await dataClient.getTrack(pluginId, libraryId, trackId, {
				relations: {
					identities: true,
					attributes: true,
					artists: {
						attributes: true,
						identities: true,
					},
				},
			});

			if (!track) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Track not found");
			}

			return {
				song: formatTrack(track),
			};
		});
	}
}
