CREATE TABLE `class_voter_links` (
	`owner_id` text NOT NULL,
	`school_year` text NOT NULL,
	`class_id` text NOT NULL,
	`voter_id` text NOT NULL,
	PRIMARY KEY(`owner_id`, `school_year`, `class_id`, `voter_id`)
);
--> statement-breakpoint
CREATE TABLE `voting_memberships` (
	`owner_id` text NOT NULL,
	`school_year` text NOT NULL,
	`class_id` text NOT NULL,
	`revision` text NOT NULL,
	PRIMARY KEY(`owner_id`, `school_year`)
);
