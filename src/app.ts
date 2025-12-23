import { Hono } from 'hono';
import roomsRoute from './routes/rooms.route';

export const app = new Hono().basePath('/api');

app.route('/rooms', roomsRoute);
