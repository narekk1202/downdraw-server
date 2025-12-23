import { db } from '..';
import { rooms } from '../db/schema';

class RoomsService {
	public async getAll() {
		return await db.select().from(rooms);
	}

	public async createRoom(name: string, creatorId: string) {
		return await db.insert(rooms).values({ name, creatorId }).returning();
	}
}

export const roomsService = new RoomsService();
