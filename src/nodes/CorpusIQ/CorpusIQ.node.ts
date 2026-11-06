import {
	NodeApiError,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';

import { CorpusIQMcpClient } from './mcpClient';

/**
 * CorpusIQ for n8n.
 *
 * Three operations, chosen because they are the three things a workflow actually
 * needs: ask a question across connected tools, check what is connected before
 * asking, and call any MCP tool by name when the curated operations do not cover
 * it. The node is `usableAsTool`, so an n8n AI Agent can call CorpusIQ itself.
 *
 * The answer is returned as text plus the structured payload, because a workflow
 * downstream wants a field to filter on, not a paragraph to parse.
 */
export class CorpusIQ implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'CorpusIQ',
		name: 'corpusIQ',
		icon: 'file:corpusiq.svg',
		group: ['output'],
		version: [1],
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Ask questions across your connected business tools (Google Analytics, Stripe, Shopify, HubSpot, Gmail and 40+ more) and get an answer that names its sources',
		defaults: { name: 'CorpusIQ' },
		usableAsTool: true,
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'corpusIQApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Ask CorpusIQ',
						value: 'ask',
						action: 'Ask a question across connected tools',
						description:
							'Ask a plain-language question and get an answer assembled from your connected systems',
					},
					{
						name: 'Get Connector Status',
						value: 'status',
						action: 'List connected sources and their status',
						description: 'Check which sources are connected before asking a question that needs them',
					},
					{
						name: 'Call MCP Tool',
						value: 'tool',
						action: 'Call any CorpusIQ MCP tool by name',
						description:
							'For tools the operations above do not cover. Tool names and schemas are listed in the CorpusIQ docs',
					},
				],
				default: 'ask',
			},
			{
				displayName: 'Question',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				required: true,
				displayOptions: { show: { operation: ['ask'] } },
				description:
					'What you want to know. Name the period and the source when the answer depends on them, for example "which Shopify products sold out last week"',
			},
			{
				displayName: 'Tool Name',
				name: 'toolName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { operation: ['tool'] } },
				description: 'The MCP tool name, for example ask_corpusiq or get_connector_status',
			},
			{
				displayName: 'Tool Arguments (JSON)',
				name: 'toolArguments',
				type: 'json',
				default: '{}',
				displayOptions: { show: { operation: ['tool'] } },
				description: 'Arguments passed to the tool as a JSON object',
			},
			{
				displayName: 'Include Raw Response',
				name: 'includeRaw',
				type: 'boolean',
				default: false,
				description:
					'Whether to add the full MCP result under `raw`. Turn on when a later node needs the structured payload',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const output: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('corpusIQApi');
		const endpoint = String(credentials.endpoint || 'https://mcp2.corpusiq.io/mcp');
		const token = String(credentials.token || '');
		if (!token) {
			throw new NodeOperationError(this.getNode(), 'A CorpusIQ access token is required.');
		}
		const client = new CorpusIQMcpClient(endpoint, token);

		for (let i = 0; i < items.length; i++) {
			const operation = this.getNodeParameter('operation', i) as string;
			const includeRaw = this.getNodeParameter('includeRaw', i, false) as boolean;

			try {
				if (operation === 'ask') {
					const prompt = this.getNodeParameter('prompt', i) as string;
					if (!prompt || !prompt.trim()) {
						throw new NodeOperationError(this.getNode(), 'The question is empty.', { itemIndex: i });
					}
					const result = await client.callTool('ask_corpusiq', { question: prompt });
					if (result.isError) {
						throw new NodeOperationError(
							this.getNode(),
							`CorpusIQ answered with an error: ${result.text.slice(0, 300)}`,
							{ itemIndex: i },
						);
					}
					output.push({
						json: includeRaw
							? ({ answer: result.text, raw: result.raw as IDataObject } as IDataObject)
							: ({ answer: result.text } as IDataObject),
						pairedItem: { item: i },
					});
					continue;
				}

				if (operation === 'status') {
					const result = await client.callTool('get_connector_status', {});
					if (result.isError) {
						throw new NodeOperationError(
							this.getNode(),
							`CorpusIQ connector status failed: ${result.text.slice(0, 300)}`,
							{ itemIndex: i },
						);
					}
					const raw = result.raw as IDataObject;
					output.push({
						json: includeRaw
							? ({ status: result.text, raw } as IDataObject)
							: ((raw && (raw as IDataObject).data) as IDataObject) ?? ({ status: result.text } as IDataObject),
						pairedItem: { item: i },
					});
					continue;
				}

				const toolName = (this.getNodeParameter('toolName', i) as string).trim();
				if (!toolName) {
					throw new NodeOperationError(this.getNode(), 'A tool name is required.', { itemIndex: i });
				}
				let args: IDataObject = {};
				const rawArgs = this.getNodeParameter('toolArguments', i, '{}');
				if (typeof rawArgs === 'string') {
					try {
						args = rawArgs.trim() ? (JSON.parse(rawArgs) as IDataObject) : {};
					} catch (error) {
						throw new NodeOperationError(
							this.getNode(),
							`Tool arguments are not valid JSON: ${(error as Error).message}`,
							{ itemIndex: i },
						);
					}
				} else {
					args = (rawArgs ?? {}) as IDataObject;
				}

				const result = await client.callTool(toolName, args as Record<string, unknown>);
				if (result.isError) {
					throw new NodeOperationError(
						this.getNode(),
						`CorpusIQ tool ${toolName} returned an error: ${result.text.slice(0, 300)}`,
						{ itemIndex: i },
					);
				}
				output.push({
					json: includeRaw
						? ({ result: result.text, raw: result.raw as IDataObject } as IDataObject)
						: ({ result: result.text } as IDataObject),
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					output.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				if (error instanceof NodeOperationError) {
					throw error;
				}
				throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
			}
		}

		return [output];
	}
}
