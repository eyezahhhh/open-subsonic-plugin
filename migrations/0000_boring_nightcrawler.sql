CREATE TABLE `album_artists` (
	`album_id` text,
	`artist_id` text,
	`ordinal` integer,
	`join_phrase` text,
	`sync_id` text NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `albums` (
	`id` text PRIMARY KEY NOT NULL,
	`sync_id` text NOT NULL,
	`title` text NOT NULL,
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
CREATE TABLE `song_artists` (
	`song_id` text,
	`artist_id` text,
	`ordinal` integer,
	`join_phrase` text,
	`sync_id` text NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` text PRIMARY KEY NOT NULL,
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
	`disc_number` integer
);
