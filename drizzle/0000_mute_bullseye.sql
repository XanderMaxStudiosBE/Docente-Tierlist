CREATE TABLE `votes` (
	`voter_id` text NOT NULL,
	`teacher_id` integer NOT NULL,
	`tier` text NOT NULL,
	PRIMARY KEY(`voter_id`, `teacher_id`),
	CONSTRAINT "valid_teacher" CHECK("votes"."teacher_id" BETWEEN 1 AND 7),
	CONSTRAINT "valid_tier" CHECK("votes"."tier" IN ('S','A','B','C','D','E','F'))
);
--> statement-breakpoint
CREATE INDEX `idx_votes_teacher_tier` ON `votes` (`teacher_id`,`tier`);