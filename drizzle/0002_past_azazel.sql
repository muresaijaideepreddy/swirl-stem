CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `billing_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`lesson_index` integer NOT NULL,
	`language` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`storage_key` text,
	`provider_id` text,
	`playback_id` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assets_course` ON `content_assets` (`course_id`);--> statement-breakpoint
CREATE TABLE `content_courses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`draft` text NOT NULL,
	`published` text,
	`published_assets` text,
	`status` text NOT NULL,
	`revision` integer NOT NULL,
	`published_revision` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`message` text NOT NULL,
	`status` text NOT NULL,
	`provider_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `licenses` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`amount` integer NOT NULL,
	`status` text NOT NULL,
	`session_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `purchase_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`school_id` text NOT NULL,
	`data` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text NOT NULL,
	`certificate_key` text,
	`certificate_mime` text,
	`customer_id` text,
	`invoice_id` text,
	`invoice_url` text,
	`invoice_pdf` text,
	`review_note` text,
	`created_at` integer NOT NULL,
	`approved_at` integer
);
--> statement-breakpoint
CREATE TABLE `sample_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`ip_hash` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_content` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
DROP INDEX `schools_owner`;--> statement-breakpoint
CREATE UNIQUE INDEX `schools_owner_name` ON `schools` (`owner_id`,`name`);--> statement-breakpoint
CREATE INDEX `schools_owner` ON `schools` (`owner_id`);