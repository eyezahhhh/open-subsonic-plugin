import {
	SavedAlbum,
	SavedAlbumArtist,
	SavedArtist,
	SavedArtistTrack,
	SavedAttribute,
	SavedPlaylist,
	SavedTrack,
} from "@sdk";
import {
	AlbumID3,
	AlbumID3WithSongs,
	Artist,
	Child,
	Playlist,
} from "./types.js";
import { createAttributeRecord, getAttributeValue } from "./util.js";

export function formatArtist(artist: SavedArtist): Artist {
	const attributes = createAttributeRecord(artist?.attributes ?? []);
	const name = getAttributeValue(attributes, "name", "string");
	const coverArt = getAttributeValue(attributes, "thumb", "buffer");

	const musicbrainzId = artist?.identities?.find(
		(identity) => identity.identityId == "musicbrainz_artist_id",
	)?.identity;

	const albums: AlbumID3[] = [];

	if (artist.albums) {
		for (const albumLink of artist.albums) {
			if (albumLink.album) {
				const formatted = formatAlbum(albumLink.album);
				albums.push(formatted);
			}
		}
	}

	return {
		id: artist.uuid,
		name: name?.trim() || "Unknown Artist",
		albumCount: artist?.albums?.length ?? 0,
		musicBrainzId: musicbrainzId ?? "",
		coverArt: coverArt ? `${coverArt.uuid}.${coverArt.extension}` : "",
		album: artist.albums ? albums : undefined,
	};
}

export function blankArtist(uuid: string): Artist {
	return {
		id: uuid,
		name: "Unknown Artist",
		albumCount: 0,
		musicBrainzId: "",
		coverArt: "",
	};
}

export function formatAlbum(album: SavedAlbum): AlbumID3WithSongs {
	const attributes = createAttributeRecord(album?.attributes ?? []);
	const name = getAttributeValue(attributes, "title", "string");
	const coverArt = getAttributeValue(attributes, "front", "buffer");

	let artistName = "";
	let artistId = "";

	if (album.artists?.length) {
		const sorted = [...album.artists].sort((a, b) => a.ordinal - b.ordinal);
		const primaryArtist = sorted[0]!;
		artistName =
			getAttributeValue(primaryArtist.artist?.attributes, "name", "string") ??
			"";
		artistId = primaryArtist.artistUuid;
	}

	let duration = 0;
	const tracks: SavedTrack[] = [];
	for (const { track } of album.tracks ?? []) {
		if (track) {
			tracks.push(track);
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

	return {
		id: album.uuid,
		name: name ?? "Unknown Album",
		songCount: album.tracks?.length ?? 0,
		created: new Date().toISOString(),
		duration,
		artist: artistName,
		artistId,
		artists: album.artists?.map((artist) =>
			artist.artist
				? formatArtist(artist.artist)
				: blankArtist(artist.artistUuid),
		),
		displayArtist: getArtistString(album.artists, attributes) ?? undefined,
		coverArt: coverArt ? `${coverArt.uuid}.${coverArt.extension}` : "",
		song: album.tracks ? tracks.map(formatTrack) : undefined,
	};
}

export function formatTrack(track: SavedTrack): Child {
	const attributes = createAttributeRecord(track?.attributes ?? []);
	const coverArt = getAttributeValue(attributes, "front", "buffer");

	let artistName = "";
	let artistId = "";
	let artists: SavedArtistTrack[] | undefined = undefined;

	if (track.artists?.length) {
		const existingIds = new Set<string>();

		artists = [...track.artists]
			.sort((a, b) => a.ordinal - b.ordinal)
			.filter((artist) => {
				if (existingIds.has(artist.artistUuid)) {
					return false;
				}
				existingIds.add(artist.artistUuid);
				return true;
			});
		const primaryArtist = artists[0]!;
		artistName =
			getAttributeValue(primaryArtist.artist?.attributes, "name", "string") ??
			"";
		artistId = primaryArtist.artistUuid;
	}

	return {
		id: `${track.pluginId}~${track.libraryId}~${track.trackId}`,
		title: getAttributeValue(attributes, "title", "string") ?? "Unknown Track",
		isDir: false,
		artist: artistName,
		artistId,
		artists: artists?.map((artist) =>
			artist.artist
				? formatArtist(artist.artist)
				: blankArtist(artist.artistUuid),
		),
		displayArtist: getArtistString(track.artists, attributes) ?? "",
		coverArt: coverArt ? `${coverArt.uuid}.${coverArt.extension}` : "",
		year: getAttributeValue(attributes, "year", "integer") ?? 0,
		duration: Math.round(
			getAttributeValue(attributes, "duration", "decimal") ?? 0,
		),
		bitRate: Math.round(
			(getAttributeValue(attributes, "bitrate", "integer") ?? 0) / 1000,
		),
		samplingRate: getAttributeValue(attributes, "samplerate", "integer") ?? 0,
		channelCount: getAttributeValue(attributes, "channels", "integer") ?? 0,
		averageRating: getAttributeValue(attributes, "rating", "decimal") ?? 0,
		mediaType: "song",
		bpm: getAttributeValue(attributes, "bpm", "decimal") ?? 0,
		album: "",
		albumId: "",
	};
}

export function getArtistString(
	artists: (SavedArtistTrack | SavedAlbumArtist)[] | undefined | null,
	attributes: Record<string, SavedAttribute>,
) {
	if (artists) {
		const fullArtists = artists.map(({ artist, joinPhrase }) => ({
			...artist,
			joinPhrase,
		}));
		if (fullArtists.length) {
			let artistString = "";
			for (const [i, artist] of fullArtists.entries()) {
				const record = createAttributeRecord(artist?.attributes ?? []);
				const nameAttribute = record.name;
				if (nameAttribute?.type == "string" && nameAttribute.values.length) {
					artistString += nameAttribute.values[0];
					if (artist.joinPhrase) {
						artistString += artist.joinPhrase;
					} else if (i < fullArtists.length - 1) {
						artistString += ", ";
					}
				}
			}

			return artistString;
		}
	}

	let artistString = "";
	const attribute = attributes?.artist;
	if (attribute?.type == "string" && attribute.values.length) {
		for (const [i, name] of attribute.values.entries()) {
			artistString += name;
			if (i < attribute.values.length - 1) {
				artistString += ", ";
			}
		}
	}

	return artistString || null;
}

export function formatPlaylist(playlist: SavedPlaylist): Playlist {
	const attributes = createAttributeRecord(playlist.attributes ?? []);

	const tracks: Child[] = [];
	let containsTracks = false;
	let duration = 0;
	for (const { track } of playlist.tracks ?? []) {
		if (track) {
			containsTracks = true;
			tracks.push(formatTrack(track));
			const trackDuration = getAttributeValue(
				track.attributes,
				"duration",
				"decimal",
			);
			if (trackDuration) {
				duration += trackDuration;
			}
		}
	}

	return {
		id: playlist.uuid,
		name:
			getAttributeValue(attributes, "title", "string") ?? "Unknown Playlist",
		songCount: playlist.tracks?.length ?? 0,
		duration,
		created: playlist.dateCreated.toISOString(),
		changed: playlist.dateCreated.toISOString(),
		allowedUser: playlist.owner ? [playlist.owner.username] : [],
		owner: playlist.owner?.username ?? "",
		entry: containsTracks ? tracks : undefined,
	};
}
