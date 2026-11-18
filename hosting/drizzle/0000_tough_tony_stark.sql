CREATE TABLE `room_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `room_peers` (
	`room_id` text NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`measure_id` text NOT NULL,
	`event_index` integer NOT NULL,
	`seen_at` integer NOT NULL,
	PRIMARY KEY(`room_id`, `client_id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `peer_seen` ON `room_peers` (`room_id`,`seen_at`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`owner_hash` text NOT NULL,
	`score` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`operations` text NOT NULL
);
