CREATE TABLE `album_saves` (
	`album_id` text,
	`user_id` text NOT NULL,
	`date_saved` integer,
	`sync_id` text NOT NULL,
	PRIMARY KEY(`album_id`, `user_id`),
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `artist_saves` (
	`artist_id` text,
	`user_id` text NOT NULL,
	`date_saved` integer,
	`sync_id` text NOT NULL,
	PRIMARY KEY(`artist_id`, `user_id`),
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `song_saves` (
	`song_id` text,
	`user_id` text NOT NULL,
	`date_saved` integer,
	`sync_id` text NOT NULL,
	PRIMARY KEY(`song_id`, `user_id`)
);
