CREATE TABLE `class_settings` (
	`class_id` text PRIMARY KEY NOT NULL,
	`teacher_names` text NOT NULL
);
--> statement-breakpoint
DROP INDEX `idx_duels_round_pair`;--> statement-breakpoint
ALTER TABLE `duels` ADD `class_id` text DEFAULT '1ITF04' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_duels_class_round_pair` ON `duels` (`class_id`,`round_id`,`left_id`,`right_id`);--> statement-breakpoint
DROP INDEX `idx_votes_round_teacher_tier`;--> statement-breakpoint
ALTER TABLE `votes` ADD `class_id` text DEFAULT '1ITF04' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_votes_class_round_teacher_tier` ON `votes` (`class_id`,`round_id`,`teacher_id`,`tier`);--> statement-breakpoint
DROP INDEX `idx_weekly_round_week`;--> statement-breakpoint
ALTER TABLE `weekly_votes` ADD `class_id` text DEFAULT '1ITF04' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_weekly_class_round_week` ON `weekly_votes` (`class_id`,`round_id`,`week`);