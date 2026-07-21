CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `providers` ("id", "name", "created_at") VALUES ('anthropic', 'Anthropic', unixepoch() * 1000);--> statement-breakpoint
-- Null out session references that no longer resolve (pre-FK data) so the
-- table recreation below satisfies the new session_id foreign key.
UPDATE `requests` SET `session_id` = NULL WHERE `session_id` IS NOT NULL AND `session_id` NOT IN (SELECT `id` FROM `sessions`);--> statement-breakpoint
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
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`provider` text NOT NULL,
	`source` text NOT NULL,
	`client_key` text,
	FOREIGN KEY (`provider`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("id", "created_at", "last_seen_at", "provider", "source", "client_key") SELECT "id", "created_at", "last_seen_at", "provider", "source", "client_key" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_provider_client_key_idx` ON `sessions` (`provider`,`client_key`);--> statement-breakpoint
CREATE TABLE `__new_requests` (
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
	`request_id` text,
	`session_id` text,
	`parent_request_id` integer,
	`response_key` text,
	FOREIGN KEY (`provider`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_requests`("id", "created_at", "provider", "model", "path", "method", "status", "streaming", "input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "request_id", "session_id", "parent_request_id", "response_key") SELECT "id", "created_at", "provider", "model", "path", "method", "status", "streaming", "input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "request_id", "session_id", "parent_request_id", "response_key" FROM `requests`;--> statement-breakpoint
DROP TABLE `requests`;--> statement-breakpoint
ALTER TABLE `__new_requests` RENAME TO `requests`;--> statement-breakpoint
CREATE INDEX `requests_session_id_idx` ON `requests` (`session_id`);--> statement-breakpoint
CREATE INDEX `requests_response_key_idx` ON `requests` (`response_key`);