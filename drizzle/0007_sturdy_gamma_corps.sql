PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_duels` (
	`class_id` text DEFAULT '1ITF04' NOT NULL,
	`voter_id` text NOT NULL,
	`round_id` text NOT NULL,
	`left_id` integer NOT NULL,
	`right_id` integer NOT NULL,
	`winner_id` integer NOT NULL,
	PRIMARY KEY(`voter_id`, `round_id`, `left_id`, `right_id`),
	CONSTRAINT "duel_pair" CHECK("__new_duels"."left_id" BETWEEN 1 AND 29 AND "__new_duels"."right_id" BETWEEN 2 AND 30 AND "__new_duels"."left_id" < "__new_duels"."right_id"),
	CONSTRAINT "duel_winner" CHECK("__new_duels"."winner_id" IN ("__new_duels"."left_id","__new_duels"."right_id"))
);
--> statement-breakpoint
INSERT INTO `__new_duels`("class_id", "voter_id", "round_id", "left_id", "right_id", "winner_id") SELECT "class_id", "voter_id", "round_id", "left_id", "right_id", "winner_id" FROM `duels`;--> statement-breakpoint
DROP TABLE `duels`;--> statement-breakpoint
ALTER TABLE `__new_duels` RENAME TO `duels`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_duels_class_round_pair` ON `duels` (`class_id`,`round_id`,`left_id`,`right_id`);--> statement-breakpoint
CREATE TABLE `__new_favorites` (
	`class_id` text NOT NULL,
	`round_id` text NOT NULL,
	`voter_id` text NOT NULL,
	`teacher_id` integer NOT NULL,
	PRIMARY KEY(`class_id`, `round_id`, `voter_id`),
	CONSTRAINT "favorite_teacher" CHECK("__new_favorites"."teacher_id" BETWEEN 1 AND 30)
);
--> statement-breakpoint
INSERT INTO `__new_favorites`("class_id", "round_id", "voter_id", "teacher_id") SELECT "class_id", "round_id", "voter_id", "teacher_id" FROM `favorites`;--> statement-breakpoint
DROP TABLE `favorites`;--> statement-breakpoint
ALTER TABLE `__new_favorites` RENAME TO `favorites`;--> statement-breakpoint
CREATE TABLE `__new_votes` (
	`voter_id` text NOT NULL,
	`teacher_id` integer NOT NULL,
	`tier` text NOT NULL,
	`round_id` text DEFAULT 'initial' NOT NULL,
	`class_id` text DEFAULT '1ITF04' NOT NULL,
	PRIMARY KEY(`voter_id`, `teacher_id`),
	CONSTRAINT "valid_teacher" CHECK("__new_votes"."teacher_id" BETWEEN 1 AND 30),
	CONSTRAINT "valid_tier" CHECK("__new_votes"."tier" IN ('S','A','B','C','D','E','F'))
);
--> statement-breakpoint
INSERT INTO `__new_votes`("voter_id", "teacher_id", "tier", "round_id", "class_id") SELECT "voter_id", "teacher_id", "tier", "round_id", "class_id" FROM `votes`;--> statement-breakpoint
DROP TABLE `votes`;--> statement-breakpoint
ALTER TABLE `__new_votes` RENAME TO `votes`;--> statement-breakpoint
CREATE INDEX `idx_votes_class_round_teacher_tier` ON `votes` (`class_id`,`round_id`,`teacher_id`,`tier`);--> statement-breakpoint
CREATE TABLE `__new_weekly_votes` (
	`class_id` text DEFAULT '1ITF04' NOT NULL,
	`voter_id` text NOT NULL,
	`teacher_id` integer NOT NULL,
	`tier` text NOT NULL,
	`round_id` text NOT NULL,
	`week` text NOT NULL,
	PRIMARY KEY(`voter_id`, `teacher_id`, `round_id`, `week`),
	CONSTRAINT "weekly_teacher" CHECK("__new_weekly_votes"."teacher_id" BETWEEN 1 AND 30),
	CONSTRAINT "weekly_tier" CHECK("__new_weekly_votes"."tier" IN ('S','A','B','C','D','F'))
);
--> statement-breakpoint
INSERT INTO `__new_weekly_votes`("class_id", "voter_id", "teacher_id", "tier", "round_id", "week") SELECT "class_id", "voter_id", "teacher_id", "tier", "round_id", "week" FROM `weekly_votes`;--> statement-breakpoint
DROP TABLE `weekly_votes`;--> statement-breakpoint
ALTER TABLE `__new_weekly_votes` RENAME TO `weekly_votes`;--> statement-breakpoint
CREATE INDEX `idx_weekly_class_round_week` ON `weekly_votes` (`class_id`,`round_id`,`week`);--> statement-breakpoint
ALTER TABLE `saved_tierlists` ADD `teacher_names` text;