ALTER TABLE `requests` ADD `new_input_tokens` integer;--> statement-breakpoint
-- Backfill deltas for existing rows from their recorded parents:
-- promptSize(this) − (promptSize(parent) + output(parent)).
UPDATE `requests` SET `new_input_tokens` =
	(COALESCE(`input_tokens`, 0) + COALESCE(`cache_read_input_tokens`, 0) + COALESCE(`cache_creation_input_tokens`, 0))
	- (SELECT COALESCE(p.`input_tokens`, 0) + COALESCE(p.`cache_read_input_tokens`, 0) + COALESCE(p.`cache_creation_input_tokens`, 0) + COALESCE(p.`output_tokens`, 0)
		FROM `requests` p WHERE p.`id` = `requests`.`parent_request_id`)
WHERE `parent_request_id` IS NOT NULL;