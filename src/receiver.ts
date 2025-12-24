import { DurableObject } from 'cloudflare:workers';

type User = {
	id: string;
	name: string;
};

export class WebhookReceiver extends DurableObject<CloudflareBindings> {
	constructor(ctx: DurableObjectState, env: CloudflareBindings) {
		super(ctx, env);
	}

	async fetch(req: Request) {
		if (req.method === 'DELETE') {
			this.broadcastRoomDeleted();
			return new Response(null, { status: 204 });
		}

		const url = new URL(req.url);
		const userId = url.searchParams.get('userId');
		const userName = url.searchParams.get('userName');

		if (!userId || !userName) {
			return new Response('Missing userId or userName', { status: 400 });
		}

		const websocketPair = new WebSocketPair();
		const [client, server] = Object.values(websocketPair);

		this.ctx.acceptWebSocket(server);
		server.serializeAttachment({ id: userId, name: userName });

		this.broadcastUsers();

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	broadcastUsers(excludeWs?: WebSocket) {
		const websockets = this.ctx.getWebSockets();
		const users = websockets
			.filter(ws => ws !== excludeWs)
			.map(ws => ws.deserializeAttachment() as User)
			.filter(user => user !== null);

		const message = JSON.stringify({ type: 'users', users });

		for (const ws of websockets) {
			if (ws === excludeWs) continue;
			try {
				ws.send(message);
			} catch (e) {
				console.error('Error sending message to websocket', e);
			}
		}
	}

	broadcastRoomDeleted() {
		const websockets = this.ctx.getWebSockets();
		const message = JSON.stringify({ type: 'room_deleted' });

		for (const ws of websockets) {
			try {
				ws.send(message);
				ws.close(1000, 'Room deleted');
			} catch (e) {
				console.error('Error sending message to websocket', e);
			}
		}
	}

	webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const websockets = this.ctx.getWebSockets();
		for (const client of websockets) {
			if (client !== ws) {
				try {
					client.send(message);
				} catch (e) {
					console.error('Error sending message to websocket', e);
				}
			}
		}
	}

	webSocketError(ws: WebSocket, error: unknown) {
		console.error('webSocketError', error);
		this.broadcastUsers(ws);
	}

	webSocketClose(
		ws: WebSocket,
		_code: number,
		_reason: string,
		_wasClean: boolean
	) {
		this.broadcastUsers(ws);
	}
}
