import { Context } from 'hono';
import { roomService } from '../services/room.service';

export const roomHandler = {
	create: async (c: Context) => {
		const { name } = await c.req.json();
		const room = await roomService.createRoom(name);
		return c.json(room, 201);
	},
};
