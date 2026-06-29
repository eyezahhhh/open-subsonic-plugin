import { PlaylistClient } from "@sdk";
import { CreateEndpointFunction, WebModule } from "./web-module.js";
import { Playlist } from "../types.js";
import { formatPlaylist } from "../formatter.js";
import { ErrCode, SubsonicError } from "../subsonic.error.js";

export class PlaylistsWebModule extends WebModule {
	constructor(private readonly playlistClient: PlaylistClient) {
		super();
	}

	bind(endpoint: CreateEndpointFunction): void {
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

		endpoint("getPlaylist", async ({ userId, queryParams }) => {
			const { id } = queryParams;
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
					tracks: {
						track: {
							artists: {
								attributes: true,
							},
							attributes: true,
						},
					},
				},
			});

			if (!playlist) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Playlist not found");
			}
			if (playlist.ownerUuid != userId) {
				throw new SubsonicError(ErrCode.UNAUTHORIZED_USER, "Unauthorized");
			}

			return {
				playlist: formatPlaylist(playlist),
			};
		});
	}
}
