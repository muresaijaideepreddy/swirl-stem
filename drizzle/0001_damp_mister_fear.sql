CREATE TABLE `school_checkouts` (
	`school_id` text PRIMARY KEY NOT NULL,
	`attempt` text NOT NULL,
	`session_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `school_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_by` text,
	`revoked` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `school_invites_hash` ON `school_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `school_invites_school` ON `school_invites` (`school_id`);--> statement-breakpoint
CREATE TABLE `school_locks` (
	`school_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `school_members` (
	`school_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`school_id`, `user_id`),
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `school_members_user` ON `school_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `schools` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`customer_id` text,
	`subscription_id` text,
	`status` text DEFAULT 'none' NOT NULL,
	`paid_until` integer DEFAULT 0 NOT NULL,
	`period_end` integer DEFAULT 0 NOT NULL,
	`cancel_at_end` integer DEFAULT 0 NOT NULL,
	`synced_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schools_owner` ON `schools` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `schools_customer` ON `schools` (`customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `schools_subscription` ON `schools` (`subscription_id`);