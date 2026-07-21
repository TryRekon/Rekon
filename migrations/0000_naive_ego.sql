CREATE TABLE `requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`provider` text DEFAULT 'anthropic' NOT NULL,
	`model` text,
	`path` text NOT NULL,
	`method` text NOT NULL,
	`status` integer NOT NULL,
	`streaming` integer DEFAULT false NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`cache_creation_input_tokens` integer,
	`cache_read_input_tokens` integer,
	`request_id` text
);
