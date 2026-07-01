import { SavedAlbum, SavedArtist, SavedTrack } from "@sdk";
import * as Schema from "./schema.js";
import { createAttributeRecord, getAttributeValue } from "../util.js";
import { getArtistString } from "../formatter.js";

namespace DBFormatter {
	export function toSong(track: SavedTrack) {
		const attributes = createAttributeRecord(track.attributes ?? []);

		const coverArt = getAttributeValue(attributes, "front", "buffer");
		const bitrate = getAttributeValue(attributes, "bitrate", "integer");

		const songTemplate: Omit<Schema.Song, "syncId"> = {
			id: `${track.pluginId}~${track.libraryId}~${track.trackId}`,
			originalUuid: track.uuid,
			title: getAttributeValue(attributes, "title", "string") ?? track.title,
			duration: getAttributeValue(attributes, "duration", "decimal") ?? 0,
			coverArt: coverArt && `${coverArt.uuid}.${coverArt.extension}`,
			bitrate: bitrate ? Math.round(bitrate / 1000) : undefined,
			samplerate: getAttributeValue(attributes, "samplerate", "integer"),
			channels: getAttributeValue(attributes, "channels", "integer"),
			rating: getAttributeValue(attributes, "rating", "decimal"),
			dateCreated: track.dateAdded.getTime(),
		};

		if (track.albums?.length) {
			const songs: Omit<Schema.Song, "syncId">[] = [];
			for (const link of track.albums) {
				songs.push({
					...songTemplate,
					id: `${songTemplate.id}~${link.albumUuid}`,
					albumId: link.albumUuid,
					trackNumber: link.trackNumber,
					discNumber: link.discNumber,
				});
			}
			return songs;
		}

		return [songTemplate];
	}

	export function toAlbum(album: SavedAlbum) {
		const attributes = createAttributeRecord(album.attributes ?? []);

		const coverArt = getAttributeValue(attributes, "front", "buffer");

		let duration = 0;
		for (const { track } of album.tracks ?? []) {
			if (track) {
				const attributes = track.attributes;
				if (attributes) {
					const trackDuration = getAttributeValue(
						attributes,
						"duration",
						"decimal",
					);
					if (trackDuration) {
						duration += trackDuration;
					}
				}
			}
		}

		const albumTemplate: Omit<Schema.Album, "syncId"> = {
			id: album.uuid,
			title:
				getAttributeValue(attributes, "title", "string") ?? "Unknown Album",
			displayArtist: getArtistString(
				album.artists?.map((link) => ({
					albumId: link.albumUuid,
					artistId: link.artistUuid,
					ordinal: link.ordinal,
					joinPhrase: link.joinPhrase,
					artist: {
						id: link.artistUuid,
						syncId: "",
						name:
							getAttributeValue(link.artist?.attributes, "name", "string") ??
							"Unknown Artist",
					},
				})) ?? [],
			),
			songCount: album.tracks?.length ?? 0,
			duration,
			coverArt: coverArt && `${coverArt.uuid}.${coverArt.extension}`,
			dateCreated: album.dateAdded.getTime(),
			year: getAttributeValue(attributes, "year", "integer"),
		};
		return albumTemplate;
	}

	export function toArtist(artist: SavedArtist) {
		const attributes = createAttributeRecord(artist.attributes ?? []);

		const coverArt = getAttributeValue(attributes, "thumb", "buffer");

		const artistTemplate: Omit<Schema.Artist, "syncId"> = {
			id: artist.uuid,
			name: getAttributeValue(attributes, "name", "string") ?? "Unknown Artist",
			albumCount: artist.albums?.length ?? 0,
			coverArt: coverArt && `${coverArt.uuid}.${coverArt.extension}`,
		};
		return artistTemplate;
	}
}

export default DBFormatter;
