// GET /<galerie>/?foto=<klíč> — vloží OG (Open Graph) meta tagy pro jednu
// konkrétní fotku do staticky vybuildovaného dist/<galerie>/index.html a
// pošle upravenou verzi. Bez `?foto=` je odpověď bit-identická s dneškem
// (tahle routa se v tom případě přeskočí přes `next()`).
//
// PROČ na serveru, ne jen klientsky: sdílecí scraper Facebooku (a dalších
// sítí) si stránku stáhne a přečte <head>, ale JAVASCRIPT NESPOUŠTÍ. Kdyby
// se OG tagy vkládaly jen klientským skriptem (jako třeba otevření
// lightboxu v MediaGalerie.astro), scraper by uviděl generický <head> celé
// galerie, ne konkrétní fotku — sdílený odkaz na Facebooku by ukazoval
// špatný náhled a titulek.
//
// PROČ před statikou (viz zapojení v server.js): `express.static` by jinak
// vrátil `dist/<galerie>/index.html` beze změny dřív, než se tahle routa
// vůbec stihne spustit.
//
// Styl podle server/adminForget.js: čisté, testovatelné funkce dole, tenký
// Express handler nahoře nad nimi. Tahle routa NIKDY nesmí vrátit chybu
// návštěvníkovi (viz vytvorHandlerOgFoto) — nejhorší přípustný výsledek je
// stránka bez OG tagů, ne 500.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { najdiGaleriiPodleSlugu } from '../src/lib/galerie.js';
import { jeZobrazitelna, odpovidaKlicovemuSlovu, urlOdvozene } from '../src/lib/fotkyJadro.js';
import { readPhotoRecord } from './photoRecords.js';
import { isValidKey } from './slug.js';

// Escapuje hodnotu jdoucí do `content="…"` — volat na KAŽDOU hodnotu, která
// může obsahovat `"`, `&`, `<` nebo `>` (titulek fotky je uživatelský/EXIF
// vstup, nedůvěryhodný).
function escapeAtribut(text) {
	return String(text)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

// Sestaví blok OG (+ Twitter Card) meta tagů pro jednu fotku v jedné
// galerii. Vrací `null`, když fotka neexistuje, nepatří do téhle galerie
// (podle klíčového slova), nebo není zobrazitelná (chybí rozměry/některá
// odvozená velikost) — ve všech případech se OG tagy prostě nevloží.
//
// `popis` je volitelný (viz prectiPopis níže) — přebírá se z existujícího
// `<meta name="description">` stránky galerie, protože záznam fotky žádný
// vlastní popisný text nenese (jen titulek/autora/licenci). Když chybí,
// og:description se do bloku vůbec nedá (rozhodnutí "vynechat tag, když
// chybí" platí stejně jako u description obecně na webu).
function sestavOgTagy({ fotka, galerie, absolutniZaklad, popis = null }) {
	if (!fotka) return null;
	if (!odpovidaKlicovemuSlovu(fotka, galerie.klicGalerie.toLowerCase())) return null;
	if (!jeZobrazitelna(fotka)) return null;

	const url2048 = urlOdvozene(fotka, 2048);
	if (!url2048) return null;

	const titulek = fotka.titulek?.trim() || galerie.nazev;
	const ogUrl = `${absolutniZaklad}${galerie.cesta}?foto=${fotka.klic}`;
	const ogImage = `${absolutniZaklad}${url2048}`;
	const sirka = fotka.rozmery.sirka;
	const vyska = fotka.rozmery.vyska;

	const radky = [
		'<meta property="og:type" content="website">',
		'<meta property="og:site_name" content="Michal Hartman">',
		'<meta property="og:locale" content="cs_CZ">',
		`<meta property="og:title" content="${escapeAtribut(titulek)}">`,
	];
	if (popis) {
		// `popis` sem přichází z prectiPopis(html), tj. z HTML, které Astro už
		// samo escapovalo — needcapovat znovu.
		radky.push(`<meta property="og:description" content="${popis}">`);
	}
	radky.push(
		`<meta property="og:url" content="${escapeAtribut(ogUrl)}">`,
		`<meta property="og:image" content="${escapeAtribut(ogImage)}">`,
		`<meta property="og:image:width" content="${sirka}">`,
		`<meta property="og:image:height" content="${vyska}">`,
		`<meta property="og:image:alt" content="${escapeAtribut(titulek)}">`,
		'<meta name="twitter:card" content="summary_large_image">',
		`<meta name="twitter:title" content="${escapeAtribut(titulek)}">`,
		`<meta name="twitter:image" content="${escapeAtribut(ogImage)}">`,
	);

	return radky.join('\n');
}

// Vloží blok tagů těsně před POSLEDNÍ výskyt `</head>`. Prostá string
// manipulace (žádná nová závislost jako cheerio) — jen se přidává, nic se
// nehledá/nenahrazuje uvnitř existujícího obsahu. Chybí-li `</head>`, vrátí
// html beze změny (radši nevkládat nic, než vložit na nesmyslné místo).
function vlozOgTagy(html, blokTagu) {
	const idx = html.lastIndexOf('</head>');
	if (idx === -1) return html;
	return `${html.slice(0, idx)}${blokTagu}\n${html.slice(idx)}`;
}

// Najde hodnotu `<meta name="description" content="…">`, kterou do stránky
// vložil Astro/Base.astro. Nic se znovu needcapuje — Astro escapování už
// udělalo při buildu.
function prectiPopis(html) {
	const shoda = html.match(/<meta name="description" content="([^"]*)"/);
	return shoda ? shoda[1] : null;
}

// Načte záznam fotky podle klíče. Validace klíče PŘED jakýmkoliv čtením
// z disku — stejný vzorec jako forgetPhoto v adminForget.js. Neplatný klíč
// (typicky pokus o path traversal) se nikdy nedostane k readPhotoRecord.
async function nactiFotku(klic) {
	if (!isValidKey(klic)) return null;
	return readPhotoRecord(klic);
}

// Vytvoří Express handler pro GET /<galerie>/. Kdykoliv se nedá sestavit
// smysluplná odpověď s OG tagy, handler zavolá next() a nechá požadavek
// doputovat ke statickému servírování dál v řetězu middlewarů (server.js) —
// návštěvník dostane přesně to, co dostává dnes.
//
// POZNÁMKA k pořadí kroků: dist/<galerie>/index.html se čte dřív, než se
// staví blok OG tagů (ne až po něm) — potřebujeme z něj přes prectiPopis()
// vytáhnout existující meta description a použít ji jako og:description.
function vytvorHandlerOgFoto({ distDir }) {
	return async function handlerOgFoto(req, res, next) {
		try {
			const klic = req.query.foto;
			// Express 5 může u opakovaných/vnořených query klíčů (?foto=a&foto=b,
			// ?foto[x]=y) vrátit pole/objekt místo řetězce — takový vstup
			// nemá smysl a jde rovnou k next().
			if (typeof klic !== 'string' || klic.length === 0) {
				next();
				return;
			}

			const slug = req.path.replace(/^\//, '').replace(/\/$/, '');
			const galerie = najdiGaleriiPodleSlugu(slug);
			if (!galerie) {
				next();
				return;
			}
			// Express routuje bez `strict routing` (výchozí), takže tahle routa se
			// spustí i pro `/scotland` BEZ koncového lomítka, ne jen pro
			// `/scotland/`. Bez téhle kontroly bychom takový požadavek obsloužili
			// rovnou (200 s HTML), a připravili tak návštěvníka o standardní
			// přesměrování na tvar s lomítkem, které dřív dělal `express.static`
			// (301 → `/scotland/?foto=…`) — next() to přesměrování vrátí zpátky.
			if (req.path !== galerie.cesta) {
				next();
				return;
			}

			const fotka = await nactiFotku(klic);
			if (!fotka) {
				next();
				return;
			}

			const host = req.get('host');
			if (!host) {
				next();
				return;
			}
			// Funguje díky `app.set('trust proxy', 1)` v server.js — req.protocol
			// pak čte X-Forwarded-Proto od Railway, ne protokol k internímu portu.
			const absolutniZaklad = `${req.protocol}://${host}`;

			// Cesta se skládá ZE SLUGU Z ALLOWLISTU (galerie.slug pochází z
			// src/lib/galerie.js), ne z URL požadavku — žádné riziko path
			// traversal ani při chybě výše v řetězci.
			let html;
			try {
				html = await fsp.readFile(path.join(distDir, galerie.slug, 'index.html'), 'utf8');
			} catch (err) {
				if (err.code === 'ENOENT') {
					next();
					return;
				}
				throw err;
			}

			const popis = prectiPopis(html);
			const blokTagu = sestavOgTagy({ fotka, galerie, absolutniZaklad, popis });
			if (!blokTagu) {
				next();
				return;
			}

			res.type('html');
			res.set('Cache-Control', 'public, max-age=0, must-revalidate');
			res.send(vlozOgTagy(html, blokTagu));
		} catch (err) {
			// Tahle routa nikdy nesmí vrátit chybu návštěvníkovi — nejhorší
			// přípustný výsledek je stránka bez OG tagů (next() dál posune
			// požadavek na normální statické servírování).
			console.error('Vložení OG tagů selhalo:', err);
			next();
		}
	};
}

export { escapeAtribut, sestavOgTagy, vlozOgTagy, prectiPopis, nactiFotku, vytvorHandlerOgFoto };
