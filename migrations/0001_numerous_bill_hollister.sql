PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_album_artists` (
	`album_id` text,
	`artist_id` text,
	`ordinal` integer,
	`join_phrase` text,
	`sync_id` text NOT NULL,
	PRIMARY KEY(`album_id`, `artist_id`),
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_album_artists`("album_id", "artist_id", "ordinal", "join_phrase", "sync_id") SELECT "album_id", "artist_id", "ordinal", "join_phrase", "sync_id" FROM `album_artists`;--> statement-breakpoint
DROP TABLE `album_artists`;--> statement-breakpoint
ALTER TABLE `__new_album_artists` RENAME TO `album_artists`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_song_artists` (
	`song_id` text,
	`artist_id` text,
	`ordinal` integer,
	`join_phrase` text,
	`sync_id` text NOT NULL,
	PRIMARY KEY(`song_id`, `artist_id`),
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_song_artists`("song_id", "artist_id", "ordinal", "join_phrase", "sync_id") SELECT "song_id", "artist_id", "ordinal", "join_phrase", "sync_id" FROM `song_artists`;--> statement-breakpoint
DROP TABLE `song_artists`;--> statement-breakpoint
ALTER TABLE `__new_song_artists` RENAME TO `song_artists`;