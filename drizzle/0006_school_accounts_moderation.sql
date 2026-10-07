CREATE TABLE `favorites` (
	`class_id` text NOT NULL,
	`round_id` text NOT NULL,
	`voter_id` text NOT NULL,
	`teacher_id` integer NOT NULL,
	PRIMARY KEY(`class_id`, `round_id`, `voter_id`),
	CONSTRAINT "favorite_teacher" CHECK("favorites"."teacher_id" BETWEEN 1 AND 7)
);
--> statement-breakpoint
CREATE TABLE `member_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`salt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_accounts_email_unique` ON `member_accounts` (`email`);--> statement-breakpoint
CREATE TABLE `member_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `photo_submissions` (
	`object_key` text PRIMARY KEY NOT NULL,
	`name_key` text NOT NULL,
	`teacher_name` text NOT NULL,
	`owner_hash` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	`status` text NOT NULL,
	CONSTRAINT "photo_status" CHECK("photo_submissions"."status" IN ('pending','approved','rejected'))
);
--> statement-breakpoint
CREATE INDEX `idx_photo_status` ON `photo_submissions` (`status`);--> statement-breakpoint
CREATE TABLE `saved_tierlists` (
	`account_id` text NOT NULL,
	`school_year` text NOT NULL,
	`class_id` text NOT NULL,
	`ranking` text NOT NULL,
	PRIMARY KEY(`account_id`, `school_year`, `class_id`)
);
--> statement-breakpoint
CREATE TABLE `school_years` (
	`year` text PRIMARY KEY NOT NULL
);
