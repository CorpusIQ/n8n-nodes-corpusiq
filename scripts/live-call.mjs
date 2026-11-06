// Live proof that the compiled client actually works against the server.
//
// A build that compiles proves nothing about a transport. This script imports the
// SAME compiled module the node uses (dist/nodes/CorpusIQ/mcpClient.js), against
// the real endpoint, with a real token, and prints what came back. Run it whenever
// the transport changes:
//
//   CORPUSIQ_MCP_TOKEN=... node scripts/live-call.mjs

import { CorpusIQMcpClient } from '../dist/nodes/CorpusIQ/mcpClient.js';

const endpoint = process.env.CORPUSIQ_MCP_ENDPOINT || 'https://mcp2.corpusiq.io/mcp';
const token = process.env.CORPUSIQ_MCP_TOKEN;
if (!token) {
	console.error('CORPUSIQ_MCP_TOKEN is required');
	process.exit(2);
}

const client = new CorpusIQMcpClient(endpoint, token);

const tools = await client.listTools();
console.log(`listTools: ${tools.length} tools`);
const names = tools.map((t) => t.name);
for (const required of ['ask_corpusiq', 'get_connector_status']) {
	if (!names.includes(required)) {
		throw new Error(`expected tool missing from the server: ${required}`);
	}
}

const status = await client.callTool('get_connector_status', {});
if (status.isError) throw new Error(`get_connector_status returned isError: ${status.text.slice(0, 200)}`);
console.log(`get_connector_status: ok, ${status.text.length} chars`);
console.log(status.text.slice(0, 240).replace(/\s+/g, ' '));

// A read-only tool call with no connected data must return a normal answer or a
// typed error, and never a transport failure. That is the difference we care about.
const probe = await client.callTool('get_connector_status', { connector_id: 'shopify' });
console.log(`connector_id=shopify: isError=${probe.isError} ${probe.text.slice(0, 120).replace(/\s+/g, ' ')}`);

console.log('LIVE CALL OK');
