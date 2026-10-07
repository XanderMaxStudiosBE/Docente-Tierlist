CREATE TABLE `teacher_photos` (
	`name_key` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`owner_hash` text NOT NULL,
	`uploaded_at` integer NOT NULL
);
