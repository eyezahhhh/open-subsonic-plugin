import { DataClient } from "@pipe-bomb/plugin-sdk";
import { parseTrackId } from "../util.js";
import { CreateEndpointFunction, ParamFunction, WebModule } from "./web-module.js";

export class AnnotationWebModule extends WebModule {
	bind(endpoint: CreateEndpointFunction): void {
		endpoint("star", async ({ param, dataClient, userId }) => {
			await this.setStarred(param, dataClient, userId, true);
		});

		endpoint("unstar", async ({ param, dataClient, userId }) => {
			await this.setStarred(param, dataClient, userId, false);
		});
	}

	private async setStarred(
		param: ParamFunction,
		dataClient: DataClient,
		userId: string,
		starred: boolean,
	) {
		for (const id of param("id", true)) {
			const parsed = parseTrackId(id);
			if (!parsed) {
				continue;
			}
			if (starred) {
				await dataClient.saveTrack(
					{
						pluginId: parsed.pluginId,
						libraryId: parsed.libraryId,
						trackId: parsed.trackId,
					},
					userId,
				);
			} else {
				const track = await dataClient.getTrack(
					parsed.pluginId,
					parsed.libraryId,
					parsed.trackId,
				);
				if (!track) {
					continue;
				}
				await dataClient.unsaveTrack(track.uuid, userId);
			}
		}

		for (const albumId of param("albumId", true)) {
			if (starred) {
				await dataClient.saveAlbum(albumId, userId);
			} else {
				await dataClient.unsaveAlbum(albumId, userId);
			}
		}

		for (const artistId of param("artistId", true)) {
			if (starred) {
				await dataClient.saveArtist(artistId, userId);
			} else {
				await dataClient.unsaveArtist(artistId, userId);
			}
		}
	}
}
