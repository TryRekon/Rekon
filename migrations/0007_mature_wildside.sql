-- Destructive rebuild for the multi-user refactor: systems become
-- user-owned, UUID-keyed ingest targets and sessions require one, so the
-- accumulated single-tenant data has no home in the new shape. All usage
-- tables are dropped and recreated empty; `providers` (and its seed rows)
-- survives. Users carry a generic (auth_provider, auth_subject) identity so
-- any configured OAuth provider (Google, GitHub) can sign in.
DROP TABLE IF EXISTS `tool_calls`;--> statement-breakpoint
DROP TABLE IF EXISTS `tools`;--> statement-breakpoint
DROP TABLE IF EXISTS `requests`;--> statement-breakpoint
DROP TABLE IF EXISTS `sessions`;--> statement-breakpoint
DROP TABLE IF EXISTS `systems`;--> statement-breakpoint
DROP TABLE IF EXISTS `users`;--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_provider` text NOT NULL,
	`auth_subject` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`picture` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_auth_identity_idx` ON `users` (`auth_provider`,`auth_subject`);--> statement-breakpoint
CREATE TABLE `systems` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`first_event_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `systems_user_id_idx` ON `systems` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`provider` text NOT NULL,
	`source` text NOT NULL,
	`client_key` text,
	`system_id` text NOT NULL,
	`toolset_hash` text,
	FOREIGN KEY (`provider`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`system_id`) REFERENCES `systems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_provider_system_client_key_idx` ON `sessions` (`provider`,`system_id`,`client_key`);--> statement-breakpoint
CREATE INDEX `sessions_system_id_idx` ON `sessions` (`system_id`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`provider` text NOT NULL,
	`model` text,
	`path` text NOT NULL,
	`method` text NOT NULL,
	`status` integer NOT NULL,
	`streaming` integer DEFAULT false NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`cache_creation_input_tokens` integer,
	`cache_read_input_tokens` integer,
	`new_input_tokens` integer,
	`request_id` text,
	`session_id` text,
	`parent_request_id` integer,
	`response_key` text,
	`stop_reason` text,
	`user_text` text,
	`assistant_text` text,
	FOREIGN KEY (`provider`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `requests_session_id_idx` ON `requests` (`session_id`);--> statement-breakpoint
CREATE INDEX `requests_response_key_idx` ON `requests` (`response_key`);--> statement-breakpoint
CREATE TABLE `tool_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`provider` text NOT NULL,
	`session_id` text NOT NULL,
	`request_id` integer NOT NULL,
	`result_request_id` integer,
	`tool_use_id` text NOT NULL,
	`func` text NOT NULL,
	`input` text,
	`input_tokens` integer,
	`output` text,
	`output_tokens` integer,
	`is_error` integer,
	FOREIGN KEY (`provider`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`result_request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tool_calls_provider_tool_use_id_idx` ON `tool_calls` (`provider`,`tool_use_id`);--> statement-breakpoint
CREATE INDEX `tool_calls_session_id_idx` ON `tool_calls` (`session_id`);--> statement-breakpoint
CREATE TABLE `tools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`system_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`input_schema` text,
	`definition_tokens` integer NOT NULL,
	`definition_hash` text NOT NULL,
	`revisions` integer DEFAULT 1 NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`last_changed_at` integer,
	FOREIGN KEY (`provider`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`system_id`) REFERENCES `systems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tools_provider_system_name_idx` ON `tools` (`provider`,`system_id`,`name`);
