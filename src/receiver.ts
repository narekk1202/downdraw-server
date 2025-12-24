import { DurableObject } from 'cloudflare:workers';

type User = {
	id: string;
	name: string;
};

type CursorPosition = {
	x: number;
	y: number;
};

type MessageType =
	| 'drawing'
	| 'cursor'
	| 'clear_canvas'
	| 'users'
	| 'room_deleted'
	| 'init_drawing';

interface BaseMessage {
	type: MessageType;
}

interface DrawingMessage extends BaseMessage {
	type: 'drawing';
	data: string;
}

interface CursorMessage extends BaseMessage {
	type: 'cursor';
	userId: string;
	userName: string;
	position: CursorPosition;
}

interface ClearCanvasMessage extends BaseMessage {
	type: 'clear_canvas';
}

type IncomingMessage = DrawingMessage | CursorMessage | ClearCanvasMessage;

const DRAWING_STORAGE_KEY = 'drawing_data';

export class WebhookReceiver extends DurableObject<CloudflareBindings> {
	constructor(ctx: DurableObjectState, env: CloudflareBindings) {
		super(ctx, env);
	}

	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);

		if (req.method === 'DELETE') {
			return this.handleRoomDeletion();
		}

		const userId = url.searchParams.get('userId');
		const userName = url.searchParams.get('userName');

		if (!userId || !userName) {
			return new Response('Missing userId or userName', { status: 400 });
		}

		if (req.headers.get('Upgrade') !== 'websocket') {
			return new Response('Expected Upgrade: websocket', { status: 426 });
		}

		const { 0: client, 1: server } = new WebSocketPair();

		this.ctx.acceptWebSocket(server);

		server.serializeAttachment({ id: userId, name: userName } as User);

		await this.sendInitialState(server);

		this.broadcastUserList();

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	private async sendInitialState(ws: WebSocket) {
		const existingDrawing = await this.ctx.storage.get<string>(
			DRAWING_STORAGE_KEY
		);
		if (existingDrawing) {
			ws.send(JSON.stringify({ type: 'init_drawing', data: existingDrawing }));
		}
	}

	private broadcast(message: string, excludeWs?: WebSocket) {
		for (const ws of this.ctx.getWebSockets()) {
			if (ws === excludeWs) continue;
			try {
				ws.send(message);
			} catch (e) {
				console.error('Error broadcasting message:', e);
			}
		}
	}

	private broadcastUserList(excludeWs?: WebSocket) {
		const websockets = this.ctx.getWebSockets();

		const users = websockets
			.filter(ws => ws !== excludeWs)
			.map(ws => ws.deserializeAttachment() as User | null)
			.filter((user): user is User => user !== null);

		this.broadcast(JSON.stringify({ type: 'users', users }), excludeWs);
	}

	private async handleRoomDeletion(): Promise<Response> {
		this.broadcast(JSON.stringify({ type: 'room_deleted' }));

		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.close(1000, 'Room deleted');
			} catch {}
		}

		await this.ctx.storage.delete(DRAWING_STORAGE_KEY);
		return new Response(null, { status: 204 });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		if (typeof message !== 'string') return;

		try {
			const parsed = JSON.parse(message) as IncomingMessage;

			switch (parsed.type) {
				case 'drawing':
					await this.ctx.storage.put(DRAWING_STORAGE_KEY, parsed.data);
					this.broadcast(message, ws);
					break;

				case 'clear_canvas':
					await this.ctx.storage.delete(DRAWING_STORAGE_KEY);
					this.broadcast(message, ws);
					break;

				case 'cursor':
					this.broadcast(message, ws);
					break;

				default:
					this.broadcast(message, ws);
					break;
			}
		} catch (e) {
			console.error('Error parsing WebSocket message:', e);
		}
	}

	webSocketError(ws: WebSocket, error: unknown) {
		console.error('WebSocket Error:', error);
		this.broadcastUserList(ws);
	}

	webSocketClose(
		ws: WebSocket,
		code: number,
		reason: string,
		wasClean: boolean
	) {
		this.broadcastUserList(ws);
	}
}
