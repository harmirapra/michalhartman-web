// Tenký server nad hotovým buildem.
//
// Nahrazuje `serve dist` — dělá přesně totéž a nic navíc: servíruje statické
// soubory z `dist/`, včetně `index.html` pro adresářové cesty (web používá
// adresy se závěrečným lomítkem), s kompresí a portem podle Railway.
//
// Architektura na tenhle základ později naváže vlastní cesty (`/photos/*`,
// `/api/index.json`, `/admin/upload`, `/admin/rebuild`) — v téhle fázi žádná
// z nich nevzniká.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express from 'express';
import sharp from 'sharp';

// Připraveno pro zpracování fotek v pozdější fázi. Bez tohohle si libvips drží
// vlastní vyrovnávací paměť a paměťová stopa při hromadném zpracování roste.
sharp.cache(false);
sharp.concurrency(1);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const port = process.env.PORT || 4321;

const app = express();

app.disable('x-powered-by');
app.use(compression());
app.use(express.static(distDir));

// Neznámá cesta = 404, žádný fallback na index.html (tohle není SPA).
app.use((req, res) => {
	res
		.status(404)
		.type('html')
		.send(
			'<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>404 – stránka nenalezena</title></head><body><h1>404</h1><p>Stránka nenalezena.</p></body></html>',
		);
});

app.listen(port, () => {
	console.log(`Server naslouchá na portu ${port}`);
});
