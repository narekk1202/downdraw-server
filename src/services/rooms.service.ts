import { db } from '..';
import { rooms } from '../db/schema';

class RoomsService {
	public async getAll() {
		return await db.select().from(rooms);
	}

	public async createRoom(name: string) {
		return await db.insert(rooms).values({ name }).returning();
	}
}

export const roomsService = new RoomsService();
