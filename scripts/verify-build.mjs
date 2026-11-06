// Fail the build when the published shape is wrong.
//
// n8n loads `n8n.nodes` and `n8n.credentials` from package.json, so a stale path
// or a missing asset ships a node that silently does not appear in the panel. This
// checks the three things review rejects on: every declared file exists, the icon
// next to the node is present, and the build carries no src imports.
import { existsSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const n8n = pkg.n8n;
if (!n8n) throw new Error('package.json has no n8n block');

// copy the icon next to the compiled node (tsc does not move assets)
const iconSrc = join(root, 'src/nodes/CorpusIQ/corpusiq.svg');
const iconDst = join(root, 'dist/nodes/CorpusIQ/corpusiq.svg');
mkdirSync(dirname(iconDst), { recursive: true });
copyFileSync(iconSrc, iconDst);

const declared = [...(n8n.nodes ?? []), ...(n8n.credentials ?? [])];
for (const rel of declared) {
	const p = join(root, rel);
	if (!existsSync(p)) throw new Error(`declared file missing after build: ${rel}`);
}
if (!existsSync(iconDst)) throw new Error('node icon missing after build');
if (!declared.some((f) => f.includes('CorpusIQ.node.js'))) throw new Error('node entry not declared');
if (!declared.some((f) => f.includes('CorpusIQApi.credentials.js'))) throw new Error('credential entry not declared');

const nodeJs = readFileSync(join(root, 'dist/nodes/CorpusIQ/CorpusIQ.node.js'), 'utf8');
if (nodeJs.includes('require("../src/') || nodeJs.includes("require('../src/")) {
	throw new Error('compiled node still imports from src');
}
console.log(`verify-build: ok (${declared.length} declared files, icon copied)`);
