CREATE TABLE `album_artists` (
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
CREATE TABLE `album_genres` (
	`name` text,
	`album_id` text,
	`sync_id` text NOT NULL,
	PRIMARY KEY(`name`, `album_id`),
	FOREIGN KEY (`name`) REFERENCES `genres`(`name`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `albums` (
	`id` text PRIMARY KEY NOT NULL,
	`sync_id` text NOT NULL,
	`title` text NOT NULL,
	`display_artist` text NOT NULL,
	`cover_art` text,
	`song_count` integer,
	`duration` real,
	`date_created` integer,
	`year` integer,
	`musicbrainz_id` text
);
--> statement-breakpoint
CREATE TABLE `artists` (
	`id` text PRIMARY KEY NOT NULL,
	`sync_id` text NOT NULL,
	`name` text NOT NULL,
	`cover_art` text,
	`album_count` integer,
	`musicbrainz_id` text
);
--> statement-breakpoint
CREATE TABLE `genres` (
	`name` text PRIMARY KEY NOT NULL,
	`sync_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `song_artists` (
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
CREATE TABLE `song_genres` (
	`name` text,
	`song_id` text,
	`sync_id` text NOT NULL,
	PRIMARY KEY(`name`, `song_id`),
	FOREIGN KEY (`name`) REFERENCES `genres`(`name`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` text PRIMARY KEY NOT NULL,
	`original_uuid` text NOT NULL,
	`sync_id` text NOT NULL,
	`title` text NOT NULL,
	`cover_art` text,
	`duration` real,
	`bitrate` integer,
	`samplerate` integer,
	`channels` integer,
	`rating` real,
	`bpm` integer,
	`musicbrainz_id` text,
	`album_id` text,
	`track_number` integer,
	`disc_number` integer,
	`date_created` integer
);
--> statement-breakpoint
CREATE INDEX `songs_original_uuid_ifx` ON `songs` (`original_uuid`);