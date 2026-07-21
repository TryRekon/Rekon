CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`provider` text NOT NULL,
	`source` text NOT NULL,
	`client_key` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_client_key_idx` ON `sessions` (`client_key`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`response_key` text
);
--> statement-breakpoint
INSERT INTO `__new_requests`("id", "created_at", "provider", "model", "path", "method", "status", "streaming", "input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "request_id", "session_id", "parent_request_id", "response_key") SELECT "id", "created_at", "provider", "model", "path", "method", "status", "streaming", "input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "request_id", "session_id", "parent_request_id", "response_key" FROM `requests`;--> statement-breakpoint
DROP TABLE `requests`;--> statement-breakpoint
ALTER TABLE `__new_requests` RENAME TO `requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `requests_session_id_idx` ON `requests` (`session_id`);--> statement-breakpoint
CREATE INDEX `requests_response_key_idx` ON `requests` (`response_key`);