import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { roomsService } from '../services/rooms.service';
import { roomValidation } from '../types/validations/room.validations';

const app = new Hono();

app.post('/create', zValidator('json', roomValidation), async c => {
	const { name } = c.req.valid('json');
	try {
		const newRoom = await roomsService.createRoom(name);
		return c.json({ room: newRoom });
	} catch (error) {
		console.error('Error creating room:', error);
		return c.json({ error: 'Failed to create room' }, 500);
	}
});

export default app;
