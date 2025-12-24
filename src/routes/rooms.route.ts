import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { roomsService } from '../services/rooms.service';
import { roomValidation } from '../types/validations/room.validations';

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get('/', async c => {
	try {
		const rooms = await roomsService.getAll();
		return c.json({ rooms });
	} catch (error) {
		console.error('Error fetching rooms:', error);
		return c.json({ error: 'Failed to fetch rooms' }, 500);
	}
});

app.get('/:id', async c => {
	const { id } = c.req.param();
	try {
		const room = await roomsService.getById(id);
		if (!room || room.length === 0) {
			return c.json({ error: 'Room not found' }, 404);
		}
		return c.json(room[0]);
	} catch (error) {
		console.error('Error fetching room:', error);
		return c.json({ error: 'Failed to fetch room' }, 500);
	}
});

app.post('/create', zValidator('json', roomValidation), async c => {
	const { name, creatorId } = c.req.valid('json');
	try {
		const newRoom = await roomsService.createRoom(name, creatorId);
		return c.json(newRoom[0]);
	} catch (error) {
		console.error('Error creating room:', error);
		return c.json({ error: 'Failed to create room' }, 500);
	}
});

app.delete('/:id', async c => {
	const { id } = c.req.param();
	try {
		await roomsService.deleteRoom(id);

		const doId = c.env.WEBHOOK_RECEIVER.idFromName(id);
		const stub = c.env.WEBHOOK_RECEIVER.get(doId);
		await stub.fetch(new Request('http://localhost', { method: 'DELETE' }));

		return c.json(201);
	} catch (error) {
		console.error('Error deleting room:', error);
		return c.json({ error: 'Failed to delete room' }, 500);
	}
});

app.get('/:id/ws', async c => {
	if (c.req.header('upgrade') !== 'websocket') {
		return c.text('Expected Upgrade: websocket', 426);
	}

	const { id: roomId } = c.req.param();

	const id = c.env.WEBHOOK_RECEIVER.idFromName(roomId);
	const stub = c.env.WEBHOOK_RECEIVER.get(id);

	return stub.fetch(c.req.raw);
});

export default app;
