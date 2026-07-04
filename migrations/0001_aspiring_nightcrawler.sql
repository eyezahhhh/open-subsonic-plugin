DROP INDEX `songs_original_uuid_ifx`;--> statement-breakpoint
CREATE INDEX `songs_original_uuid_idx` ON `songs` (`original_uuid`);--> statement-breakpoint
CREATE INDEX `album_genres_album_id_idx` ON `album_genres` (`album_id`);--> statement-breakpoint
CREATE INDEX `song_genres_song_id_idx` ON `song_genres` (`song_id`);