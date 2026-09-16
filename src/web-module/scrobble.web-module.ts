import { parseTrackId } from "../util.js";
import { CreateEndpointFunction, WebModule } from "./web-module.js";

export class ScrobbleWebModule extends WebModule {
	bind(endpoint: CreateEndpointFunction): void {
		endpoint(
			"scrobble",
			async ({ param, dataClient, playbackHistoryClient, userId }) => {
				const submission = param("submission");
				if (submission != "true") {
					// todo: remove false
					return {};
				}

				const clientName = param("c") ?? "Unknown OpenSubsonic client";
				const rawTrackId = param("id");
				const time = param("time");

				if (!rawTrackId) {
					return {};
				}

				let datePlayed = new Date();
				if (time) {
					try {
						const timestamp = parseInt(time);
						if (!isNaN(timestamp)) {
							datePlayed = new Date(timestamp);
						}
					} catch (e) {
						// todo: logging
					}
				}

				const trackId = parseTrackId(rawTrackId);
				if (!trackId) {
					return null;
				}

				const track = await dataClient.getTrack(
					trackId.pluginId,
					trackId.libraryId,
					trackId.trackId,
				);
				if (!track) {
					return;
				}

				await playbackHistoryClient.addHistoryEntry(
					track.uuid,
					userId,
					clientName,
					datePlayed,
				);
				console.log("Added history entry");

				return;
			},
		);
	}
}
