// Testy nad čistými funkcemi z ogFoto.js — styl podle adminForget.test.js:
// node:test + node:assert/strict, čeština v názvech, žádné mockování
// (repo mocky nepoužívá nikde jinde), integrační testy nad skutečným
// (dočasným) souborovým systémem tam, kde je potřeba disk.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureDataDirs } from '../dataDir.js';
import {
	escapeAtribut,
	nactiFotku,
	prectiPopis,
	sestavOgTagy,
	vlozOgTagy,
} from '../ogFoto.js';
import { writePhotoRecord } from '../photoRecords.js';
import { isValidKey } from '../slug.js';

ensureDataDirs();

const GALERIE_SCOTLAND = { slug: 'scotland', nazev: 'Skotsko', klicGalerie: 'Scotland', cesta: '/scotland/' };

function fakeFotka(overrides = {}) {
	return {
		klic: 'scotland--test-foto',
		rozmery: { sirka: 4000, vyska: 3000 },
		titulek: 'Skalní pobřeží',
		klicovaSlova: ['Scotland'],
		autor: 'Michal Hartman',
		licence: null,
		odvozene: [
			{ velikost: 600, soubor: 'scotland--test-foto_600_aaaaaa.webp' },
			{ velikost: 1200, soubor: 'scotland--test-foto_1200_aaaaaa.webp' },
			{ velikost: 2048, soubor: 'scotland--test-foto_2048_aaaaaa.webp' },
		],
		...overrides,
	};
}

test('sestavOgTagy: platná fotka ve správné galerii → og:image/og:url/og:title/rozměry správně', () => {
	const blok = sestavOgTagy({
		fotka: fakeFotka(),
		galerie: GALERIE_SCOTLAND,
		absolutniZaklad: 'https://michalhartman.eu',
	});
	assert.ok(blok);
	assert.match(blok, /<meta property="og:title" content="Skalní pobřeží">/);
	assert.match(
		blok,
		/<meta property="og:url" content="https:\/\/michalhartman\.eu\/scotland\/\?foto=scotland--test-foto">/,
	);
	assert.match(
		blok,
		/<meta property="og:image" content="https:\/\/michalhartman\.eu\/photos\/scotland--test-foto_2048_aaaaaa\.webp">/,
	);
	assert.match(blok, /<meta property="og:image:width" content="4000">/);
	assert.match(blok, /<meta property="og:image:height" content="3000">/);
});

test('sestavOgTagy: fotka bez klíčového slova té galerie → null', () => {
	const blok = sestavOgTagy({
		fotka: fakeFotka({ klicovaSlova: ['Greece'] }),
		galerie: GALERIE_SCOTLAND,
		absolutniZaklad: 'https://michalhartman.eu',
	});
	assert.equal(blok, null);
});

test('sestavOgTagy: shoda klíčového slova je case-insensitive', () => {
	const blok = sestavOgTagy({
		fotka: fakeFotka({ klicovaSlova: ['SCOTLAND'] }),
		galerie: GALERIE_SCOTLAND,
		absolutniZaklad: 'https://michalhartman.eu',
	});
	assert.ok(blok);
});

test('sestavOgTagy: fotka bez rozměrů → null', () => {
	const blok = sestavOgTagy({
		fotka: fakeFotka({ rozmery: undefined }),
		galerie: GALERIE_SCOTLAND,
		absolutniZaklad: 'https://michalhartman.eu',
	});
	assert.equal(blok, null);
});

test('sestavOgTagy: fotka bez odvozené velikosti 2048 → null', () => {
	const blok = sestavOgTagy({
		fotka: fakeFotka({
			odvozene: [{ velikost: 600, soubor: 'scotland--test-foto_600_aaaaaa.webp' }],
		}),
		galerie: GALERIE_SCOTLAND,
		absolutniZaklad: 'https://michalhartman.eu',
	});
	assert.equal(blok, null);
});

test('sestavOgTagy: fotka bez titulku → og:title je název galerie', () => {
	const blok = sestavOgTagy({
		fotka: fakeFotka({ titulek: null }),
		galerie: GALERIE_SCOTLAND,
		absolutniZaklad: 'https://michalhartman.eu',
	});
	assert.match(blok, /<meta property="og:title" content="Skotsko">/);
	assert.match(blok, /<meta property="og:image:alt" content="Skotsko">/);
});

test('sestavOgTagy: titulek s uvozovkami a "&" je escapovaný v atributu', () => {
	const blok = sestavOgTagy({
		fotka: fakeFotka({ titulek: 'Skály & moře "na severu"' }),
		galerie: GALERIE_SCOTLAND,
		absolutniZaklad: 'https://michalhartman.eu',
	});
	assert.match(blok, /content="Skály &amp; moře &quot;na severu&quot;"/);
	assert.doesNotMatch(blok, /content="Skály & moře "na severu""/);
});

test('escapeAtribut: escapuje &, <, >, "', () => {
	assert.equal(escapeAtribut(`a & b < c > d "e"`), 'a &amp; b &lt; c &gt; d &quot;e&quot;');
});

test('vlozOgTagy: vloží blok těsně před poslední </head>, nic jiného nezmění', () => {
	const html = '<!doctype html><html><head><title>T</title></head><body>obsah</body></html>';
	const vysledek = vlozOgTagy(html, '<meta property="og:type" content="website">');
	assert.equal(
		vysledek,
		'<!doctype html><html><head><title>T</title><meta property="og:type" content="website">\n</head><body>obsah</body></html>',
	);
});

test('vlozOgTagy: bez </head> vrátí html beze změny', () => {
	const html = '<!doctype html><html><body>bez hlavičky</body></html>';
	const vysledek = vlozOgTagy(html, '<meta property="og:type" content="website">');
	assert.equal(vysledek, html);
});

test('prectiPopis: najde description', () => {
	const html = '<head><meta name="description" content="Fotogalerie Skotsko"></head>';
	assert.equal(prectiPopis(html), 'Fotogalerie Skotsko');
});

test('prectiPopis: bez description vrátí null', () => {
	const html = '<head><title>Bez popisu</title></head>';
	assert.equal(prectiPopis(html), null);
});

test('nactiFotku: neplatný klíč (path traversal) → null, isValidKey ho odmítne dřív, než dojde na disk', async () => {
	const klic = '../../etc/passwd';
	assert.equal(isValidKey(klic), false);
	assert.equal(await nactiFotku(klic), null);
});

test('nactiFotku: neexistující (ale platně tvarovaný) klíč → null', async () => {
	assert.equal(await nactiFotku('scotland--neexistujici-klic'), null);
});

test('nactiFotku: platný klíč vrátí záznam', async () => {
	const klic = 'og-foto-test--platny';
	const zaznam = {
		klic,
		otisk: `sha256:${klic}`,
		puvodniCesta: `Test/${klic}.jpg`,
		rozmery: { sirka: 100, vyska: 100 },
		titulek: 'Test',
		klicovaSlova: ['Scotland'],
		autor: null,
		licence: null,
		odvozene: [],
		zpracovanoV: new Date().toISOString(),
	};
	await writePhotoRecord(zaznam);
	const vysledek = await nactiFotku(klic);
	assert.deepEqual(vysledek, zaznam);
});
