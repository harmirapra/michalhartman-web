// Integrační testy nad skutečným (dočasným) souborovým systémem: pojistka
// proti tichému zmenšení indexu (bod D1), samooprava poškozeného index.json
// při startu a detekce kolize klíčů. Sdílí jeden DATA_DIR se zbytkem
// testovací sady (nastavuje ho `npm test` přes proměnnou prostředí), proto
// běží schválně sekvenčně (`node --test --test-concurrency=1`, viz
// package.json) — jinak by si mohly šahat do stejných sdílených souborů
// (state/index.json, state/kolize.json) souběžně s jinými testovacími
// soubory.

import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { test } from 'node:test';
import { INDEX_PATH, STATE_PHOTOS_DIR, ensureDataDirs } from '../dataDir.js';
import { checkKeyCollision, readKolize } from '../kolize.js';
import { ensureIndexHealthy, rebuildIndex } from '../mediaIndex.js';
import { writePhotoRecord } from '../photoRecords.js';

ensureDataDirs();

function fakeRecord(klic) {
	return {
		klic,
		otisk: `sha256:${klic}`,
		puvodniCesta: `Test/${klic}.jpg`,
		rozmery: { sirka: 100, vyska: 100 },
		titulek: null,
		klicovaSlova: [],
		autor: null,
		licence: null,
		odvozene: [],
		zpracovanoV: new Date().toISOString(),
	};
}

async function clearPhotoRecords() {
	const entries = await fsp.readdir(STATE_PHOTOS_DIR).catch(() => []);
	await Promise.all(entries.map((name) => fsp.unlink(`${STATE_PHOTOS_DIR}/${name}`)));
}

test('rebuildIndex: 10 -> 1 záznam bez force je odmítnuto (pod 80 %)', async () => {
	await clearPhotoRecords();
	for (let i = 0; i < 10; i++) {
		await writePhotoRecord(fakeRecord(`rebuild-test--foto-${i}`));
	}
	const prvni = await rebuildIndex({});
	assert.equal(prvni.novyPocet, 10);

	await clearPhotoRecords();
	await writePhotoRecord(fakeRecord('rebuild-test--foto-0'));

	await assert.rejects(
		() => rebuildIndex({}),
		(err) => {
			assert.equal(err.code, 'INDEX_BY_SE_ZMENSIL');
			assert.equal(err.puvodniPocet, 10);
			assert.equal(err.novyPocet, 1);
			return true;
		},
	);

	// Odmítnutý rebuild nesmí index přepsat — musí v něm pořád být předchozích 10.
	const stale = JSON.parse(await fsp.readFile(INDEX_PATH, 'utf8'));
	assert.equal(stale.fotky.length, 10);

	const vynuceny = await rebuildIndex({ force: true });
	assert.equal(vynuceny.novyPocet, 1);

	await clearPhotoRecords();
});

test('ensureIndexHealthy: poškozený index.json se přebuduje ze záznamů', async () => {
	await clearPhotoRecords();
	await writePhotoRecord(fakeRecord('sebeoprava--foto-1'));
	await writePhotoRecord(fakeRecord('sebeoprava--foto-2'));

	await fsp.writeFile(INDEX_PATH, '{ toto neni platny json');

	const vysledek = await ensureIndexHealthy();
	assert.equal(vysledek.rebuilt, true);
	assert.equal(vysledek.pocetFotek, 2);

	const opraveny = JSON.parse(await fsp.readFile(INDEX_PATH, 'utf8'));
	assert.equal(opraveny.fotky.length, 2);

	await clearPhotoRecords();
	await rebuildIndex({ force: true });
});

test('checkKeyCollision: stejná cesta ani chybějící předchozí cesta nejsou kolize', async () => {
	assert.equal(await checkKeyCollision('kolize-test--a', null, 'Foo/bar.jpg'), false);
	assert.equal(await checkKeyCollision('kolize-test--a', 'Foo/bar.jpg', 'Foo/bar.jpg'), false);
});

test('checkKeyCollision: dvě různé cesty na stejný klíč se zapíšou do state/kolize.json', async () => {
	// Syntetický případ (v reálné sbírce 169 souborů žádná skutečná kolize
	// není) — dvě různé cesty, které by po slugifikaci daly stejný klíč.
	const zmena = await checkKeyCollision(
		'kolize-test--b',
		'Scotland/Foo Bar.jpg',
		'Scotland/foo-bar.jpg',
	);
	assert.equal(zmena, true);

	const kolize = await readKolize();
	assert.ok(kolize['kolize-test--b']);
	assert.deepEqual(
		[...kolize['kolize-test--b'].cesty].sort(),
		['Scotland/Foo Bar.jpg', 'Scotland/foo-bar.jpg'].sort(),
	);
});
