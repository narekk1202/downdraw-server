import { Hono } from 'hono';
import { roomHandler } from '../handlers/room.handler';

const rooms = new Hono();
rooms.post('/', roomHandler.create);

export default rooms;
