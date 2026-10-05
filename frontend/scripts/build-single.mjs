// Inlines the Vite build (dist/) into one self-contained HTML file that opens
// by double-clicking -- no server, no Node, no internet needed.
// Run via `npm run build:single`.
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync('dist/index.html', 'utf8');
const jsPath = html.match(/<script type="module" crossorigin src="([^"]+)"/)[1];
const cssPath = html.match(/<link rel="stylesheet" crossorigin href="([^"]+)"/)[1];
const js = fs.readFileSync(path.join('dist', jsPath), 'utf8').replace(/<\/script/gi, '<\/script');
const css = fs.readFileSync(path.join('dist', cssPath), 'utf8');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Logisim Circuit Bot</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${js}</script>
</body>
</html>
`;

const out = 'logisim-circuit-bot.html';
fs.writeFileSync(path.join('dist', out), page);
console.log(`wrote dist/${out} (${Math.round(page.length / 1024)} KB)`);
