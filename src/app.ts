import { Hono } from 'hono';
import { cors } from 'hono/cors';
import roomsRoute from './routes/rooms.route';

export const app = new Hono().basePath('/api');

app.use(cors());

app.route('/rooms', roomsRoute);
