import { eq } from 'drizzle-orm';
import { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { rooms } from '../db/schema';

class RoomsService {
	public async getAll(db: NeonHttpDatabase) {
		return await db.select().from(rooms);
	}

	public async getById(db: NeonHttpDatabase, id: string) {
		return await db.select().from(rooms).where(eq(rooms.id, id));
	}

	public async createRoom(
		db: NeonHttpDatabase,
		name: string,
		creatorId: string
	) {
		return await db.insert(rooms).values({ name, creatorId }).returning();
	}

	public async deleteRoom(db: NeonHttpDatabase, id: string) {
		return await db.delete(rooms).where(eq(rooms.id, id));
	}
}

export const roomsService = new RoomsService();
