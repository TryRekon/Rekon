CREATE TABLE `tools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`system_id` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`input_schema` text,
	`definition_tokens` integer NOT NULL,
	`definition_hash` text NOT NULL,
	`revisions` integer DEFAULT 1 NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`last_changed_at` integer,
	FOREIGN KEY (`provider`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tools_provider_system_name_idx` ON `tools` (`provider`,`system_id`,`name`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `toolset_hash` text;