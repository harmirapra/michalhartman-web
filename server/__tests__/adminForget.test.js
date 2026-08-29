// Integrační testy nad skutečným (dočasným) souborovým systémem — stejný
// precedens jako rebuild.test.js. Ověřují jádro `POST /admin/forget`:
// smazání originálu, náhledů (i osiřelých) a záznamu, chování pro
// neexistující/neplatný klíč a to, že selhaný záznam (bez photoRecord) jde
// smazat taky.

import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { forgetPhoto } from '../adminForget.js';
import { DERIVED_DIR, ORIGINALS_DIR, STATE_FAILED_DIR, STATE_PHOTOS_DIR, ensureDataDirs } from '../dataDir.js';
import { writeFailedRecord, writePhotoRecord } from '../photoRecords.js';

ensureDataDirs();

function fakeRecord(klic, odvozene) {
	return {
		klic,
		otisk: `sha256:${klic}`,
		puvodniCesta: `Test/${klic}.jpg`,
		rozmery: { sirka: 100, vyska: 100 },
		titulek: null,
		klicovaSlova: [],
		autor: null,
		licence: null,
		odvozene,
		zpracovanoV: new Date().toISOString(),
	};
}

async function touch(filePath) {
	await fsp.writeFile(filePath, 'obsah');
}

async function existuje(filePath) {
	try {
		await fsp.access(filePath);
		return true;
	} catch {
		return false;
	}
}

test('forgetPhoto: smaže originál, všechny náhledy i záznam; index se přeskládá', async () => {
	const klic = 'forget-test--foto-a';
	const odvozene = [
		{ velikost: 600, soubor: `${klic}_600_aaaaaa.webp` },
		{ velikost: 1200, soubor: `${klic}_1200_aaaaaa.webp` },
		{ velikost: 2048, soubor: `${klic}_2048_aaaaaa.webp` },
	];
	await writePhotoRecord(fakeRecord(klic, odvozene));
	await touch(path.join(ORIGINALS_DIR, `${klic}.jpg`));
	for (const o of odvozene) {
		await touch(path.join(DERIVED_DIR, o.soubor));
	}

	const vysledek = await forgetPhoto(klic);
	assert.equal(vysledek.klic, klic);
	assert.equal(vysledek.odvozenychSmazano, 3);

	assert.equal(await existuje(path.join(ORIGINALS_DIR, `${klic}.jpg`)), false);
	for (const o of odvozene) {
		assert.equal(await existuje(path.join(DERIVED_DIR, o.soubor)), false);
	}
	assert.equal(await existuje(path.join(STATE_PHOTOS_DIR, `${klic}.json`)), false);
});

test('forgetPhoto: smaže i osiřelou odvozenou velikost, o které záznam neví', async () => {
	const klic = 'forget-test--osirela';
	await writePhotoRecord(fakeRecord(klic, [{ velikost: 600, soubor: `${klic}_600_bbbbbb.webp` }]));
	await touch(path.join(ORIGINALS_DIR, `${klic}.jpg`));
	await touch(path.join(DERIVED_DIR, `${klic}_600_bbbbbb.webp`));
	// Přerušené zpracování (viz deriveImages.js) — velikost vznikla, ale
	// záznam o ní neví.
	await touch(path.join(DERIVED_DIR, `${klic}_1200_cccccc.webp`));

	const vysledek = await forgetPhoto(klic);
	assert.equal(vysledek.odvozenychSmazano, 2);
	assert.equal(await existuje(path.join(DERIVED_DIR, `${klic}_1200_cccccc.webp`)), false);
});

test('forgetPhoto: nezasáhne jiný klíč, který ten hledaný má jako předponu', async () => {
	const kratky = 'forget-test--foto';
	const dlouhy = 'forget-test--foto-x';
	await writePhotoRecord(fakeRecord(kratky, [{ velikost: 600, soubor: `${kratky}_600_dddddd.webp` }]));
	await writePhotoRecord(fakeRecord(dlouhy, [{ velikost: 600, soubor: `${dlouhy}_600_eeeeee.webp` }]));
	await touch(path.join(DERIVED_DIR, `${kratky}_600_dddddd.webp`));
	await touch(path.join(DERIVED_DIR, `${dlouhy}_600_eeeeee.webp`));

	await forgetPhoto(kratky);

	assert.equal(await existuje(path.join(DERIVED_DIR, `${kratky}_600_dddddd.webp`)), false);
	// Klíč "forget-test--foto-x" nesmí zmizet spolu s "forget-test--foto".
	assert.equal(await existuje(path.join(DERIVED_DIR, `${dlouhy}_600_eeeeee.webp`)), true);
	assert.equal(await existuje(path.join(STATE_PHOTOS_DIR, `${dlouhy}.json`)), true);

	await forgetPhoto(dlouhy);
});

test('forgetPhoto: smaže i selhaný záznam, který nemá photoRecord', async () => {
	const klic = 'forget-test--selhany';
	await writeFailedRecord({
		klic,
		otisk: `sha256:${klic}`,
		chyba: 'testovací selhání',
		selhanoV: new Date().toISOString(),
	});
	await touch(path.join(ORIGINALS_DIR, `${klic}.jpg`));

	const vysledek = await forgetPhoto(klic);
	assert.equal(vysledek.klic, klic);
	assert.equal(await existuje(path.join(ORIGINALS_DIR, `${klic}.jpg`)), false);
	assert.equal(await existuje(path.join(STATE_FAILED_DIR, `${klic}.json`)), false);
});

test('forgetPhoto: neexistující klíč vrátí chybu NOT_FOUND, nic se nemaže', async () => {
	await assert.rejects(
		() => forgetPhoto('forget-test--neexistuje'),
		(err) => {
			assert.equal(err.code, 'NOT_FOUND');
			return true;
		},
	);
});

test('forgetPhoto: "../" vrátí chybu INVALID_KEY dřív, než se cokoliv čte ze záznamů', async () => {
	await assert.rejects(
		() => forgetPhoto('../'),
		(err) => {
			assert.equal(err.code, 'INVALID_KEY');
			return true;
		},
	);
});

test('forgetPhoto: chybějící/neřetězcový klíč vrátí chybu MISSING_KEY', async () => {
	await assert.rejects(
		() => forgetPhoto(undefined),
		(err) => {
			assert.equal(err.code, 'MISSING_KEY');
			return true;
		},
	);
	await assert.rejects(
		() => forgetPhoto(''),
		(err) => {
			assert.equal(err.code, 'MISSING_KEY');
			return true;
		},
	);
});
