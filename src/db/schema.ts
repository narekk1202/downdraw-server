import { sql } from 'drizzle-orm';
import {
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
	uuid,
} from 'drizzle-orm/pg-core';

export const rooms = pgTable('rooms', {
	id: uuid('id')
		.default(sql`gen_random_uuid()`)
		.primaryKey(),
	name: text('name').notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const drawings = pgTable('drawings', {
	id: serial('id').primaryKey(),
	roomId: uuid('room_id')
		.notNull()
		.references(() => rooms.id, { onDelete: 'cascade' }),
	data: jsonb('data').notNull().$type<{
		lines: Array<{ x: number; y: number; color: string; thickness: number }>;
	}>(),
	savedAt: timestamp('saved_at').notNull().defaultNow(),
});
