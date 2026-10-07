ALTER TABLE `support_tickets` ADD `kind` text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD `teacher_name` text;--> statement-breakpoint
CREATE INDEX `idx_tickets_kind_created` ON `support_tickets` (`kind`,`created_at`,`id`);