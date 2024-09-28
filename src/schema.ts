import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const telegramBotTable = sqliteTable('telegram_bot', {
	chatId: integer('chat_id').notNull().primaryKey(),
	latestId: integer('latest_id').notNull(),
	queryParams: text('query_params').notNull(),
});

export type InsertTelegramBot = typeof telegramBotTable.$inferInsert;
export type SelectTelegramBot = typeof telegramBotTable.$inferSelect;
