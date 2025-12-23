import { eq } from 'drizzle-orm';
import { db } from '..';
import { rooms } from '../db/schema';

class RoomsService {
	public async getAll() {
		return await db.select().from(rooms);
	}

	public async getById(id: string) {
		return await db.select().from(rooms).where(eq(rooms.id, id));
	}

	public async createRoom(name: string, creatorId: string) {
		return await db.insert(rooms).values({ name, creatorId }).returning();
	}

	public async deleteRoom(id: string) {
		return await db.delete(rooms).where(eq(rooms.id, id));
	}
}

export const roomsService = new RoomsService();
