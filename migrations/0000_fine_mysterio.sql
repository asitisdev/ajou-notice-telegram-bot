CREATE TABLE `telegram_bot` (
	`chat_id` integer PRIMARY KEY NOT NULL,
	`latest_id` integer NOT NULL,
	`query_params` text NOT NULL
);
