# n8n-nodes-corpusiq

Use [CorpusIQ](https://www.corpusiq.io) from n8n. Ask a question across the systems a business already runs on and get an answer that names where each figure came from.

This is an n8n community node package: a node plus a credential, no service to install.

## What it does

Most automation nodes move one system's data into another. This one answers questions across several connected systems in a single call, read-only.

```
Question: "which Shopify products sold out last week, and did traffic to them drop first?"
Answer:   assembled from your connected Shopify and Google Analytics, with the period named
```

Three operations:

| Operation | What it returns |
|---|---|
| **Ask CorpusIQ** | A plain-language answer to a question about your connected business data |
| **Get Connector Status** | Which sources are connected, which need reauthorization, which are blocked |
| **Call MCP Tool** | Any CorpusIQ MCP tool by name, for the long tail (121 tools today) |

The node is `usableAsTool`, so an n8n **AI Agent** can call CorpusIQ as a tool without any extra wiring.

## Install

```bash
npm install n8n-nodes-corpusiq
```

Self-hosted n8n picks the node up from `~/.n8n/custom` or from the community-node install UI. n8n Cloud requires the package to be in the verified community-node list first.

## Credentials

One credential, **CorpusIQ MCP API**:

- **Endpoint**: `https://mcp2.corpusiq.io/mcp` (default, leave it unless CorpusIQ gave you a tenant-specific one)
- **Access Token**: an MCP access token from your CorpusIQ account settings

Revoking the token in CorpusIQ ends the workflow's access immediately. No connector tool can write to a connected system; the only write tools manage CorpusIQ's own configuration.

## Output shape

```json
{
  "answer": "Six of nineteen orders shipped late in the week of Oct 6 ..."
}
```

Turn on **Include Raw Response** to add the full MCP result under `raw`. Use that when a later node needs to filter on a field instead of parsing prose.

A leading `[DISPLAY INSTRUCTIONS: ...]` block that the server sends for chat UIs is stripped, because a workflow consumes the field rather than rendering it.

## Development

```bash
npm install
npm run build          # tsc + a build-shape check (declared node/credential files, icon, no src imports)
npm run test:live      # calls the real server through the COMPILED client
```

`npm run test:live` needs `CORPUSIQ_MCP_TOKEN`. It is the only check that says the transport works: a compile proves the types, not the Streamable HTTP handshake, the `Mcp-Session-Id` header, or the fact that a tool-level failure arrives as `isError` inside a successful JSON-RPC result.

## Verified community node checklist

- [x] npm package name `n8n-nodes-corpusiq`, keyword `n8n-community-node-package`
- [x] One node, one credential, no shell execution, no filesystem access
- [x] Node and credential declared in `package.json` under `n8n`
- [x] Icon shipped next to the compiled node (checked by `verify-build`)
- [ ] `npm publish` from an account with 2FA (publisher step, needs the operator)
- [ ] Submission to n8n's verified-node list with the repository URL

## Licence

MIT
