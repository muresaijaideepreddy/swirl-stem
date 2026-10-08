CREATE TABLE `media_upload_parts` (
	`upload_id` text NOT NULL,
	`part` integer NOT NULL,
	`size` integer NOT NULL,
	`hash` text NOT NULL,
	`etag` text NOT NULL,
	PRIMARY KEY(`upload_id`, `part`)
);
--> statement-breakpoint
CREATE TABLE `media_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`course_id` text NOT NULL,
	`meta` text NOT NULL,
	`storage_key` text NOT NULL,
	`upload_id` text,
	`size` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text NOT NULL,
	`info` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`lock_token` text,
	`lock_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_owner` ON `media_uploads` (`owner_id`);--> statement-breakpoint
ALTER TABLE `licenses` ADD `paid_total` integer;--> statement-breakpoint
ALTER TABLE `licenses` ADD `paid_at` integer;