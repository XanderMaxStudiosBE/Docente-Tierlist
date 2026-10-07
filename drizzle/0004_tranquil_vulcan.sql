CREATE TABLE `admin_account` (
	`id` integer PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`salt` text NOT NULL,
	CONSTRAINT "single_admin" CHECK("admin_account"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `admin_attempts` (
	`bucket` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `class_rounds` (
	`class_id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL
);
