import { Hono } from 'hono'
import roomRoutes from './routes/room.routes'

export const app = new Hono()

app.route('/rooms', roomRoutes)