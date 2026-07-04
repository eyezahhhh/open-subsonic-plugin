import { InferInsertModel, relations } from "drizzle-orm";
import {
	sqliteTable,
	text,
	integer,
	real,
	primaryKey,
	index,
} from "drizzle-orm/sqlite-core";

export const genres = sqliteTable("genres", {
	name: text("name").primaryKey(),
	syncId: text("sync_id").notNull(),
});

export const albums = sqliteTable("albums", {
	id: text("id").primaryKey(),
	syncId: text("sync_id").notNull(),
	title: text("title").notNull(),
	displayArtist: text("display_artist").notNull(),
	coverArt: text("cover_art"),
	songCount: integer("song_count"),
	duration: real("duration"),
	dateCreated: integer("date_created"),
	year: integer("year"),
	musicBrainzId: text("musicbrainz_id"),
});

export const albumGenres = sqliteTable(
	"album_genres",
	{
		name: text("name").references(() => genres.name),
		albumId: text("album_id").references(() => albums.id, {
			onDelete: "cascade",
		}),
		syncId: text("sync_id").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.name, table.albumId],
		}),
		index("album_genres_album_id_idx").on(table.albumId),
	],
);

export const artists = sqliteTable("artists", {
	id: text("id").primaryKey(),
	syncId: text("sync_id").notNull(),
	name: text("name").notNull(),
	coverArt: text("cover_art"),
	albumCount: integer("album_count"),
	musicBrainzId: text("musicbrainz_id"),
});

export const albumArtists = sqliteTable(
	"album_artists",
	{
		albumId: text("album_id").references(() => albums.id, {
			onDelete: "cascade",
		}),
		artistId: text("artist_id").references(() => artists.id, {
			onDelete: "cascade",
		}),
		ordinal: integer("ordinal"),
		joinPhrase: text("join_phrase"),
		syncId: text("sync_id").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.albumId, table.artistId],
		}),
	],
);

export const songs = sqliteTable(
	"songs",
	{
		id: text("id").primaryKey(),
		originalUuid: text("original_uuid").notNull(),
		syncId: text("sync_id").notNull(),
		title: text("title").notNull(),
		coverArt: text("cover_art"),
		duration: real("duration"),
		bitrate: integer("bitrate"),
		samplerate: integer("samplerate"),
		channels: integer("channels"),
		rating: real("rating"),
		bpm: integer("bpm"),
		musicBrainzId: text("musicbrainz_id"),
		albumId: text("album_id"),
		trackNumber: integer("track_number"),
		discNumber: integer("disc_number"),
		dateCreated: integer("date_created"),
	},
	(table) => [index("songs_original_uuid_idx").on(table.originalUuid)],
);

export const songGenres = sqliteTable(
	"song_genres",
	{
		name: text("name").references(() => genres.name),
		songId: text("song_id").references(() => songs.id, {
			onDelete: "cascade",
		}),
		syncId: text("sync_id").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.name, table.songId],
		}),
		index("song_genres_song_id_idx").on(table.songId),
	],
);

export const songArtists = sqliteTable(
	"song_artists",
	{
		songId: text("song_id").references(() => songs.id, { onDelete: "cascade" }),
		artistId: text("artist_id").references(() => artists.id, {
			onDelete: "cascade",
		}),
		ordinal: integer("ordinal"),
		joinPhrase: text("join_phrase"),
		syncId: text("sync_id").notNull(),
	},
	(table) => [primaryKey({ columns: [table.songId, table.artistId] })],
);

export const albumsRelations = relations(albums, ({ many }) => ({
	albumArtists: many(albumArtists),
	songs: many(songs),
	albumGenres: many(albumGenres),
}));
export const albumGenresRelations = relations(albumGenres, ({ one }) => ({
	album: one(albums, {
		fields: [albumGenres.albumId],
		references: [albums.id],
	}),
	genre: one(genres, { fields: [albumGenres.name], references: [genres.name] }),
}));

export const artistsRelations = relations(artists, ({ many }) => ({
	albumArtists: many(albumArtists),
}));

export const albumArtistsRelations = relations(albumArtists, ({ one }) => ({
	album: one(albums, {
		fields: [albumArtists.albumId],
		references: [albums.id],
	}),
	artist: one(artists, {
		fields: [albumArtists.artistId],
		references: [artists.id],
	}),
}));

export const songsRelations = relations(songs, ({ one, many }) => ({
	album: one(albums, { fields: [songs.albumId], references: [albums.id] }),
	songArtists: many(songArtists),
	songGenres: many(songGenres),
}));
export const songGenresRelations = relations(songGenres, ({ one }) => ({
	song: one(songs, { fields: [songGenres.songId], references: [songs.id] }),
	genre: one(genres, { fields: [songGenres.name], references: [genres.name] }),
}));

export const songArtistsRelations = relations(songArtists, ({ one }) => ({
	song: one(songs, { fields: [songArtists.songId], references: [songs.id] }),
	artist: one(artists, {
		fields: [songArtists.artistId],
		references: [artists.id],
	}),
}));

export const genresRelations = relations(genres, ({ many }) => ({
	songGenres: many(songGenres),
	albumGenres: many(albumGenres),
}));

export type Album = InferInsertModel<typeof albums> & {
	albumArtists?: AlbumArtist[] | null;
	songs?: Song[] | null;
	albumGenres?: AlbumGenre[] | null;
};
export type AlbumGenre = InferInsertModel<typeof albumGenres>;
export type Artist = InferInsertModel<typeof artists> & {
	albumArtists?: AlbumArtist[] | null;
};
export type AlbumArtist = InferInsertModel<typeof albumArtists> & {
	artist?: Artist | null;
	album?: Album | null;
};
export type Song = InferInsertModel<typeof songs> & {
	songArtists?: SongArtist[] | null;
	album?: Album | null;
	songGenres?: SongGenre[] | null;
};
export type SongGenre = InferInsertModel<typeof songGenres>;
export type SongArtist = InferInsertModel<typeof songArtists> & {
	song?: Song | null;
	artist?: Artist | null;
};
export type Genre = InferInsertModel<typeof genres> & {
	songGenres?: SongGenre[] | null;
	albumGenres?: AlbumGenre[] | null;
};
