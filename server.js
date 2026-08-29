// Tenký server nad hotovým buildem + fáze 2 (trvalý disk, příjem fotek)
// + fáze 3 (zpracování fotek a servírovaný index).
//
// Statická část nahrazuje `serve dist` — servíruje soubory z `dist/`, včetně
// `index.html` pro adresářové cesty (web používá adresy se závěrečným
// lomítkem), s kompresí a portem podle Railway.
//
// Fáze 3 přidává: čtení XMP metadat a generování náhledů při uploadu
// (server/photoProcessing.js), `GET /admin/files` (mapa klíč→otisk ze
// záznamů), `POST /admin/rebuild` (poskládá index.json ze záznamů),
// `GET /admin/report` (kontrolní výpis), `GET /api/index.json` a
// `/photos/*` (servírování odvozených velikostí).
//
// POZNÁMKA k náhledu PR: volume je vázaný na konkrétní službu/prostředí,
// takže náhled PR nemusí mít disk připojený. `ensureDataDirs()` proto
// adresářovou strukturu vždy vytvoří, když chybí — v náhledu tak poběží nad
// dočasným souborovým systémem kontejneru, což pro ověření funkčnosti stačí.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express from 'express';
import sharp from 'sharp';
import { handleAdminFiles } from './server/adminFiles.js';
import { requireAdminToken } from './server/adminAuth.js';
import { handleAdminRebuild } from './server/adminRebuild.js';
import { handleAdminReport } from './server/adminReport.js';
import { DERIVED_DIR, ensureDataDirs } from './server/dataDir.js';
import { ensureIndexHealthy, readIndexOrEmpty } from './server/mediaIndex.js';
import { handleStav } from './server/stav.js';
import { handleUpload } from './server/upload.js';

// Bez tohohle si `libvips` drží vlastní vyrovnávací paměť a paměťová stopa
// při hromadném zpracování (stovky fotek za běh) roste. Změřená špička
// s tímhle nastavením je 130–155 MB. Musí se nastavit před prvním použitím
// `sharp`, proto hned tady na začátku.
sharp.cache(false);
sharp.concurrency(1);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const port = process.env.PORT || 4321;

// Server na startu selže hlasitě, když datový adresář není zapisovatelný —
// radši teď než tiše běžet dál a padat až při prvním uploadu.
ensureDataDirs();

// Poškozený/chybějící index.json se samoopraví přebudováním ze záznamů —
// jediné místo, kde poškození znamená "zmizí všechny galerie naráz", proto
// tahle kontrola běží při každém startu (viz server/mediaIndex.js).
// Na dostupnosti datového adresáře nezávisí o nic víc než zbytek /admin/* —
// když je disk nedostupný, čtení záznamů vrátí prázdný seznam a přebuduje se
// prázdný index; jakmile se disk vrátí, další rebuild/restart to spraví.
await ensureIndexHealthy();

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
adminRouter.get('/files', handleAdminFiles);
adminRouter.post('/rebuild', handleAdminRebuild);
adminRouter.get('/report', handleAdminReport);
app.use('/admin', adminRouter);

app.use(compression());

// Index pro galerii. `no-cache` je záměr, ne opomenutí: mění se při každém
// rebuildu a prohlížeč (i případná CDN mezi Railway a návštěvníkem) se musí
// zeptat znovu, jinak nahraná fotka nikdy nedorazí do galerie, aniž by to
// bylo znát na první pohled — vypadalo by to, že publikování nefunguje.
app.get('/api/index.json', async (_req, res) => {
	const index = await readIndexOrEmpty();
	res.set('Cache-Control', 'no-cache');
	res.status(200).json(index);
});

// Odvozené velikosti fotek. Bezpečné cachovat natvrdo a nadlouho — název
// nese otisk obsahu, takže se pod stejnou adresou obsah nikdy nezmění.
// Originál se odsud NIKDY neservíruje — jen `derived/`, `originals/` server
// ven vůbec neexpozuje.
app.use(
	'/photos',
	express.static(DERIVED_DIR, {
		immutable: true,
		maxAge: '1y',
	}),
);

// Soubory v /_astro/ nesou v názvu otisk obsahu, který Astro generuje při
// buildu — pod stejnou adresou se tedy nikdy nezmění obsah. Smějí se proto
// cachovat natvrdo a nadlouho. Bez tohohle je posílal express.static
// s max-age=0, takže se prohlížeč ptal znovu při každém načtení stránky
// a CDN na edge je neměla jak cachovat.
app.use(
	'/_astro',
	express.static(path.join(distDir, '_astro'), {
		immutable: true,
		maxAge: '1y',
	}),
);

// Zbytek (HTML, favicon, obrázky ve /img/) se pod stejnou adresou měnit MŮŽE
// — HTML při každém nasazení. Proto se necachuje natrvalo, jen se povolí
// revalidace: prohlížeč se zeptá, a když se nic nezměnilo, dostane 304.
app.use(
	express.static(distDir, {
		setHeaders(res) {
			res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
		},
	}),
);

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
