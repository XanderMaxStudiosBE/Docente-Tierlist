CREATE TABLE `duels` (
	`voter_id` text NOT NULL,
	`round_id` text NOT NULL,
	`left_id` integer NOT NULL,
	`right_id` integer NOT NULL,
	`winner_id` integer NOT NULL,
	PRIMARY KEY(`voter_id`, `round_id`, `left_id`, `right_id`),
	CONSTRAINT "duel_pair" CHECK("duels"."left_id" BETWEEN 1 AND 6 AND "duels"."right_id" BETWEEN 2 AND 7 AND "duels"."left_id" < "duels"."right_id"),
	CONSTRAINT "duel_winner" CHECK("duels"."winner_id" IN ("duels"."left_id","duels"."right_id"))
);
--> statement-breakpoint
CREATE INDEX `idx_duels_round_pair` ON `duels` (`round_id`,`left_id`,`right_id`);--> statement-breakpoint
CREATE TABLE `weekly_votes` (
	`voter_id` text NOT NULL,
	`teacher_id` integer NOT NULL,
	`tier` text NOT NULL,
	`round_id` text NOT NULL,
	`week` text NOT NULL,
	PRIMARY KEY(`voter_id`, `teacher_id`, `round_id`, `week`),
	CONSTRAINT "weekly_teacher" CHECK("weekly_votes"."teacher_id" BETWEEN 1 AND 7),
	CONSTRAINT "weekly_tier" CHECK("weekly_votes"."tier" IN ('S','A','B','C','D','F'))
);
--> statement-breakpoint
CREATE INDEX `idx_weekly_round_week` ON `weekly_votes` (`round_id`,`week`);