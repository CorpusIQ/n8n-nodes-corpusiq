/**
 * Minimal MCP client for the CorpusIQ remote server.
 *
 * The transport is Streamable HTTP, which means: POST JSON-RPC, read either a
 * JSON body or a text/event-stream body, and carry the Mcp-Session-Id header the
 * server returns from initialize. It is deliberately small - a community node
 * that ships a browser-sized SDK gets rejected by review and ages badly.
 *
 * Two behaviours are load-bearing and were learned from the server itself:
 *   1. The Accept header must list BOTH application/json and text/event-stream.
 *      Send only application/json and the server answers 406.
 *   2. A failed tool call comes back as a JSON-RPC result with isError true, not
 *      as a JSON-RPC error. Treating only `error` as failure reports success for
 *      a call that returned nothing.
 */

export interface McpTool {
	name: string;
	title?: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
	annotations?: Record<string, unknown>;
}

export interface McpCallResult {
	isError: boolean;
	text: string;
	raw: unknown;
}

interface JsonRpcResponse {
	jsonrpc: string;
	id?: number | string;
	result?: Record<string, unknown>;
	error?: { code: number; message: string; data?: unknown };
}

export class CorpusIQMcpClient {
	private sessionId: string | undefined;
	private nextId = 1;

	constructor(
		private readonly endpoint: string,
		private readonly token: string,
	) {}

	private async post(payload: Record<string, unknown>): Promise<{ headers: Headers; body: string }> {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json, text/event-stream',
		};
		if (this.sessionId) {
			headers['Mcp-Session-Id'] = this.sessionId;
		}

		const response = await fetch(this.endpoint, {
			method: 'POST',
			headers,
			body: JSON.stringify(payload),
		});

		const sid = response.headers.get('mcp-session-id');
		if (sid) {
			this.sessionId = sid;
		}

		const body = await response.text();
		if (!response.ok) {
			throw new Error(
				`CorpusIQ MCP HTTP ${response.status}: ${body.slice(0, 300) || response.statusText}`,
			);
		}
		return { headers: response.headers, body };
	}

	private static parse(body: string): JsonRpcResponse | undefined {
		const trimmed = body.trim();
		if (!trimmed) return undefined;
		if (trimmed.startsWith('{')) {
			return JSON.parse(trimmed) as JsonRpcResponse;
		}
		for (const line of trimmed.split('\n')) {
			if (line.startsWith('data:')) {
				const payload = line.slice(5).trim();
				if (payload && payload !== '[DONE]') {
					return JSON.parse(payload) as JsonRpcResponse;
				}
			}
		}
		return undefined;
	}

	async initialize(): Promise<void> {
		const { body } = await this.post({
			jsonrpc: '2.0',
			id: this.nextId++,
			method: 'initialize',
			params: {
				protocolVersion: '2025-03-26',
				capabilities: {},
				clientInfo: { name: 'n8n-nodes-corpusiq', version: '0.1.0' },
			},
		});
		const parsed = CorpusIQMcpClient.parse(body);
		if (parsed?.error) {
			throw new Error(`CorpusIQ MCP initialize failed: ${parsed.error.message}`);
		}
		await this.post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
	}

	async listTools(): Promise<McpTool[]> {
		await this.initialize();
		const { body } = await this.post({
			jsonrpc: '2.0',
			id: this.nextId++,
			method: 'tools/list',
			params: {},
		});
		const parsed = CorpusIQMcpClient.parse(body);
		if (parsed?.error) {
			throw new Error(`CorpusIQ MCP tools/list failed: ${parsed.error.message}`);
		}
		return ((parsed?.result?.tools as McpTool[]) ?? []).filter((t) => typeof t?.name === 'string');
	}

	async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
		await this.initialize();
		const { body } = await this.post({
			jsonrpc: '2.0',
			id: this.nextId++,
			method: 'tools/call',
			params: { name, arguments: args },
		});
		const parsed = CorpusIQMcpClient.parse(body);
		if (parsed?.error) {
			throw new Error(`CorpusIQ MCP ${name} failed: ${parsed.error.message}`);
		}

		const result = (parsed?.result ?? {}) as {
			content?: Array<{ type?: string; text?: string }>;
			isError?: boolean;
			structuredContent?: unknown;
		};

		// The server prefixes some answers with a bracketed display directive meant for a
		// chat UI ("show this table exactly"). In a workflow that is noise: the field is
		// consumed by a node, not rendered to a person. Strip a leading directive block
		// and keep the rest byte for byte.
		const joined = (result.content ?? [])
			.filter((c) => c?.type === 'text' && typeof c.text === 'string')
			.map((c) => c.text as string)
			.join('\n');

		const text = joined.replace(/^\s*\[DISPLAY INSTRUCTIONS:[^\]]*\]\s*/i, '');

		return {
			isError: result.isError === true,
			text: text || JSON.stringify(result.structuredContent ?? {}),
			raw: result.structuredContent ?? result,
		};
	}
}
