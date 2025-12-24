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

interface CanvasLine {
	points: Array<{ x: number; y: number }>;
	brushColor: string;
	brushRadius: number;
}

interface CanvasData {
	lines: CanvasLine[];
	width: number;
	height: number;
}

const DRAWING_STORAGE_KEY = 'drawing_data';
const SAVE_DEBOUNCE_MS = 1000;

export class WebhookReceiver extends DurableObject<CloudflareBindings> {
	private drawingState: CanvasData = { lines: [], width: 1200, height: 800 };
	private saveTimer: number | null = null;

	constructor(ctx: DurableObjectState, env: CloudflareBindings) {
		super(ctx, env);
		this.ctx.blockConcurrencyWhile(async () => {
			const stored = await this.ctx.storage.get<string>(DRAWING_STORAGE_KEY);
			if (stored) {
				try {
					this.drawingState = JSON.parse(stored);
				} catch {
					this.drawingState = { lines: [], width: 1200, height: 800 };
				}
			}
		});
	}

	private parseCanvasData(data: string): CanvasData | null {
		try {
			const parsed = JSON.parse(data);
			if (parsed && Array.isArray(parsed.lines)) {
				return parsed as CanvasData;
			}
		} catch {}
		return null;
	}

	private mergeDrawingData(incomingData: CanvasData): void {
		const existingLines = this.drawingState.lines;
		const incomingLines = incomingData.lines;

		const newLines: CanvasLine[] = [];

		for (const incomingLine of incomingLines) {
			const exists = existingLines.some(
				existingLine =>
					existingLine.points.length === incomingLine.points.length &&
					existingLine.brushColor === incomingLine.brushColor &&
					existingLine.brushRadius === incomingLine.brushRadius &&
					existingLine.points.every(
						(p, i) =>
							p.x === incomingLine.points[i]?.x &&
							p.y === incomingLine.points[i]?.y
					)
			);

			if (!exists) {
				newLines.push(incomingLine);
			}
		}

		const isUndo =
			incomingLines.length < existingLines.length &&
			incomingLines.every(incomingLine =>
				existingLines.some(
					existingLine =>
						existingLine.points.length === incomingLine.points.length &&
						existingLine.brushColor === incomingLine.brushColor &&
						existingLine.brushRadius === incomingLine.brushRadius &&
						existingLine.points.every(
							(p, i) =>
								p.x === incomingLine.points[i]?.x &&
								p.y === incomingLine.points[i]?.y
						)
				)
			);

		if (isUndo) {
			this.drawingState = incomingData;
		} else if (newLines.length > 0) {
			this.drawingState.lines = [...existingLines, ...newLines];
		}
	}

	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);

		if (req.method === 'DELETE') {
			return this.handleRoomDeletion();
		}

		if (req.headers.get('Upgrade') !== 'websocket') {
			return new Response('Expected Upgrade: websocket', { status: 426 });
		}

		const userId = url.searchParams.get('userId');
		const userName = url.searchParams.get('userName');

		if (!userId || !userName) {
			return new Response('Missing userId or userName', { status: 400 });
		}

		const { 0: client, 1: server } = new WebSocketPair();

		server.serializeAttachment({ id: userId, name: userName } as User);

		this.ctx.acceptWebSocket(server);

		if (this.drawingState.lines.length > 0) {
			server.send(
				JSON.stringify({
					type: 'init_drawing',
					data: JSON.stringify(this.drawingState),
				})
			);
		}

		this.broadcastUserList();

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		if (typeof message !== 'string') return;

		try {
			const parsed = JSON.parse(message) as IncomingMessage;

			switch (parsed.type) {
				case 'drawing':
					const incomingData = this.parseCanvasData(parsed.data);
					if (incomingData) {
						this.mergeDrawingData(incomingData);

						const mergedStateMessage = JSON.stringify({
							type: 'drawing',
							data: JSON.stringify(this.drawingState),
						});
						this.broadcast(mergedStateMessage, ws);

						this.scheduleSave();
					}
					break;

				case 'clear_canvas':
					this.drawingState = { lines: [], width: 1200, height: 800 };
					this.broadcast(message, ws);
					this.scheduleSave();
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

	webSocketClose(
		ws: WebSocket,
		code: number,
		reason: string,
		wasClean: boolean
	) {
		this.broadcastUserList(ws);
	}

	webSocketError(ws: WebSocket, error: unknown) {
		console.error('WebSocket Error:', error);
		this.broadcastUserList(ws);
	}

	private scheduleSave() {
		if (this.saveTimer) return;

		this.saveTimer = setTimeout(() => {
			this.ctx.storage.put(
				DRAWING_STORAGE_KEY,
				JSON.stringify(this.drawingState)
			);
			this.saveTimer = null;
		}, SAVE_DEBOUNCE_MS) as unknown as number;
	}

	private broadcast(message: string, excludeWs?: WebSocket) {
		for (const ws of this.ctx.getWebSockets()) {
			if (ws === excludeWs) continue;
			try {
				ws.send(message);
			} catch (e) {}
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

		this.drawingState = { lines: [], width: 1200, height: 800 };
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		await this.ctx.storage.delete(DRAWING_STORAGE_KEY);

		return new Response(null, { status: 204 });
	}
}
