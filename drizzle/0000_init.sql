CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`kind` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_project_path` ON `entries` (`project_id`,`path`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`opened_at` integer NOT NULL,
	`open_tabs` text DEFAULT '[]' NOT NULL,
	`active_path` text
);
--> statement-breakpoint
CREATE INDEX `projects_owner_opened` ON `projects` (`owner_id`,`opened_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`font_size` integer DEFAULT 14 NOT NULL,
	`tab_size` integer DEFAULT 2 NOT NULL,
	`insert_spaces` integer DEFAULT true NOT NULL,
	`word_wrap` integer DEFAULT false NOT NULL,
	`auto_save` integer DEFAULT false NOT NULL,
	`color_mode` text DEFAULT 'system' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
