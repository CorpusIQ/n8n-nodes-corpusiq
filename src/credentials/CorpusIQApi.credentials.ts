import type { ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * One credential, two fields: where the server is, and the token that authorizes
 * a tool call on it. The token is the same one the product issues for an MCP
 * client, so revoking it in CorpusIQ cuts the n8n workflow off immediately.
 */
export class CorpusIQApi implements ICredentialType {
	name = 'corpusIQApi';
	displayName = 'CorpusIQ MCP API';
	documentationUrl = 'https://docs.corpusiq.io/connect-chatgpt-to-business-data';
	properties: INodeProperties[] = [
		{
			displayName: 'Endpoint',
			name: 'endpoint',
			type: 'string',
			default: 'https://mcp2.corpusiq.io/mcp',
			required: true,
			description: 'The CorpusIQ MCP endpoint. Leave the default unless CorpusIQ gave you a tenant-specific one.',
		},
		{
			displayName: 'Access Token',
			name: 'token',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'A CorpusIQ MCP access token. Create one in your CorpusIQ account settings.',
		},
	];
}
