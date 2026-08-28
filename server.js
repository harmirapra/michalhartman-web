// Tenký server nad hotovým buildem + fáze 2: trvalý disk a příjem fotek.
//
// Statická část nahrazuje `serve dist` — servíruje soubory z `dist/`, včetně
// `index.html` pro adresářové cesty (web používá adresy se závěrečným
// lomítkem), s kompresí a portem podle Railway.
//
// Fáze 2 přidává `/admin/*`: chráněné tokenem, umožňuje nahrát jednu fotku
// na trvalý disk (proměnná DATA_DIR, v Railway připojený jako volume na
// /data) a zjistit stav úložiště. Žádné čtení metadat, náhledy ani index —
// to je fáze 3. `/photos/*` a `/api/index.json` taky přijdou až tam.
//
// POZNÁMKA k náhledu PR: volume je vázaný na konkrétní službu/prostředí,
// takže náhled PR nemusí mít disk připojený. `ensureDataDirs()` proto
// adresářovou strukturu vždy vytvoří, když chybí — v náhledu tak poběží nad
// dočasným souborovým systémem kontejneru, což pro ověření funkčnosti stačí.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express from 'express';
import { requireAdminToken } from './server/adminAuth.js';
import { ensureDataDirs } from './server/dataDir.js';
import { handleStav } from './server/stav.js';
import { handleUpload } from './server/upload.js';

// POZNÁMKA pro fázi 3: až se sem přidá zpracování fotek, musí inicializace
// začít `sharp.cache(false)` a `sharp.concurrency(1)`. Bez toho si libvips drží
// vlastní vyrovnávací paměť a stopa při hromadném zpracování roste.
// Teď se `sharp` záměrně neimportuje — nic ho nepoužívá a selhání nativní
// knihovny by shodilo web kvůli závislosti, kterou nepotřebuje.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const port = process.env.PORT || 4321;

// Server na startu selže hlasitě, když datový adresář není zapisovatelný —
// radši teď než tiše běžet dál a padat až při prvním uploadu.
ensureDataDirs();

const app = express();

app.disable('x-powered-by');
// Railway sedí před aplikací jako reverse proxy — bez tohohle by req.ip
// vždycky ukazoval na proxy, ne na skutečného klienta, a počítadlo
// neúspěšných pokusů (viz server/adminAuth.js) by házelo všechny do jednoho pytle.
app.set('trust proxy', 1);

// /admin/* musí být zapojené dřív, než cokoliv (i případný budoucí body
// parser) sáhne na tělo požadavku — ověření tokenu proběhne jako úplně
// první věc, bez čtení dat od klienta.
const adminRouter = express.Router();
adminRouter.use(requireAdminToken);
adminRouter.post('/upload', handleUpload);
adminRouter.get('/stav', handleStav);
app.use('/admin', adminRouter);

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
