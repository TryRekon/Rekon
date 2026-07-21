CREATE TABLE `systems` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD `system_id` text REFERENCES systems(id);--> statement-breakpoint
CREATE INDEX `sessions_system_id_idx` ON `sessions` (`system_id`);