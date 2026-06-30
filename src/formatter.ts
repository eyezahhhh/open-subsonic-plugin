import { SavedPlaylist } from "@sdk";
import * as schema from "./db/schema.js";
import { AlbumID3WithSongs, Artist, Child, Playlist } from "./types.js";
import { createAttributeRecord, getAttributeValue } from "./util.js";
import DBFormatter from "./db/db-formatter.js";

export function formatArtist(artist: schema.Artist): Artist {
	const response: Artist = {
		id: artist.id,
		name: artist.name,
		coverArt: artist.coverArt ?? "",
		musicBrainzId: artist.musicBrainzId ?? "",
		albumCount: artist.albumCount ?? 0,
	};

	if (artist.albumArtists) {
		response.album = [];
		for (const link of artist.albumArtists) {
			if (link.album) {
				response.album.push(formatAlbum(link.album));
			} else if (link.albumId) {
				response.album.push(blankAlbum(link.albumId));
			}
		}
	}

	return response;
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

export function formatAlbum(album: schema.Album): AlbumID3WithSongs {
	let artistName = "";
	let artistId = "";

	if (album.albumArtists?.length) {
		const sorted = [...album.albumArtists].sort(
			(a, b) => a.ordinal! - b.ordinal!,
		);
		const primaryArtist = sorted[0]!;
		artistName = primaryArtist.artist?.name ?? "Unknown Artist";
		artistId = primaryArtist.artistId!;
	}

	const response: AlbumID3WithSongs = {
		id: album.id,
		name: album.title,
		coverArt: album.coverArt ?? "",
		musicBrainzId: album.musicBrainzId ?? "",
		songCount: album.songCount ?? 0,
		created: new Date(album.dateCreated ?? 0).toISOString(),
		duration: Math.round(album.duration ?? 0),
		artist: artistName,
		artistId,
		artists: album.albumArtists?.map((link) =>
			link.artist ? formatArtist(link.artist) : blankArtist(link.artistId!),
		),
	};

	if (album.songs) {
		response.song = [];
		for (const song of album.songs) {
			response.song.push(formatSong(song));
		}
	}

	return response;
}

export function blankAlbum(uuid: string): AlbumID3WithSongs {
	const response: AlbumID3WithSongs = {
		id: uuid,
		name: "Unknown Album",
		coverArt: "",
		musicBrainzId: "",
		songCount: 0,
		created: new Date(0).toISOString(),
		duration: 0,
	};

	return response;
}

export function formatSong(song: Omit<schema.Song, "syncId">): Child {
	let artistName = "";
	let artistId = "";

	if (song.songArtists?.length) {
		const sorted = [...song.songArtists].sort(
			(a, b) => a.ordinal! - b.ordinal!,
		);
		const primaryArtist = sorted[0]!;
		artistName = primaryArtist.artist?.name ?? "Unknown Artist";
		artistId = primaryArtist.artistId!;
	}

	const response: Child = {
		id: song.id,
		title: song.title,
		isDir: false,
		artist: artistName,
		artistId,
		artists: song.songArtists?.map((link) =>
			link.artist ? formatArtist(link.artist) : blankArtist(link.artistId!),
		),
		displayArtist: getArtistString(song.songArtists ?? []),
		coverArt: song.coverArt ?? "",
		duration: Math.round(song.duration ?? 0),
		bitRate: song.bitrate ?? 0,
		samplingRate: song.samplerate ?? 0,
		channelCount: song.channels ?? 0,
		averageRating: song.rating ?? 0,
		mediaType: "song",
		bpm: song.bpm ?? 0,
		album: song.album?.title ?? "",
		albumId: song.albumId ?? "",
	};

	return response;
}

export function getArtistString(
	artists: Omit<schema.SongArtist | schema.AlbumArtist, "syncId">[],
) {
	const fullArtists = artists.map(({ artist, joinPhrase }) => ({
		...artist,
		joinPhrase,
	}));
	if (fullArtists.length) {
		let artistString = "";
		for (const [i, artist] of fullArtists.entries()) {
			if (artist.name) {
				artistString += artist.name;
				if (artist.joinPhrase) {
					artistString += artist.joinPhrase;
				} else if (i < fullArtists.length - 1) {
					artistString += ", ";
				}
			}
		}

		return artistString;
	}

	return "Unknown Artist";
}

export function formatPlaylist(
	playlist: SavedPlaylist,
	songs?: schema.Song[],
): Playlist {
	const attributes = createAttributeRecord(playlist.attributes ?? []);

	const tracks: Child[] = [];
	let duration = 0;
	if (songs) {
		for (const song of songs) {
			duration += song.duration ?? 0;
		}
	}

	return {
		id: playlist.uuid,
		name:
			getAttributeValue(attributes, "title", "string") ?? "Unknown Playlist",
		songCount: playlist.tracks?.length ?? 0,
		duration: Math.round(duration),
		created: playlist.dateCreated.toISOString(),
		changed: playlist.dateCreated.toISOString(),
		allowedUser: playlist.owner ? [playlist.owner.username] : [],
		owner: playlist.owner?.username ?? "",
		entry: songs?.map((song) => formatSong(song)) ?? undefined,
	};
}
