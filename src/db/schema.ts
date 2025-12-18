import { integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const roomsTable = pgTable('rooms', {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	name: varchar({ length: 255 }).notNull(),
	creatorId: integer().notNull(),
	createdAt: timestamp().defaultNow().notNull(),
	updatedAt: timestamp().defaultNow().notNull(),
});
