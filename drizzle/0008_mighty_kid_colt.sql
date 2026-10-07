CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`class_id` text NOT NULL,
	`school_year` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`last_action` text,
	CONSTRAINT "ticket_category" CHECK("support_tickets"."category" IN ('suggestion','complaint','bug')),
	CONSTRAINT "ticket_status" CHECK("support_tickets"."status" IN ('open','in_progress','closed'))
);
--> statement-breakpoint
CREATE INDEX `idx_tickets_account_created` ON `support_tickets` (`account_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_tickets_status_created` ON `support_tickets` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `ticket_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`author` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "ticket_author" CHECK("ticket_messages"."author" IN ('member','admin'))
);
--> statement-breakpoint
CREATE INDEX `idx_ticket_messages_ticket_created` ON `ticket_messages` (`ticket_id`,`created_at`,`id`);