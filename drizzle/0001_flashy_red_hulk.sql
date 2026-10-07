DROP INDEX `idx_votes_teacher_tier`;--> statement-breakpoint
ALTER TABLE `votes` ADD `round_id` text DEFAULT 'initial' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_votes_round_teacher_tier` ON `votes` (`round_id`,`teacher_id`,`tier`);