// Integrační test nad SKUTEČNÝMI fotkami z ~/Pictures/MH-web/GalleryMedia —
// jen čte (sharp/exifr obojí otvírají soubor read-only), nic tam nezapisuje
// ani nemaže. Automatizuje přesně body 1, 2 a 4 z „Hotovo, když" zadání
// fáze 3: klíčová slova (včetně diakritiky), Past 1 (jediné/číselné klíčové
// slovo) a poškozený soubor skončí ve `failed/`.
//
// Když testovací sada fotek na stroji, který test spouští, neexistuje (jiný
// stroj než Michalův Mac), testy se přeskočí, ne spadnou — nejsou to fotky,
// které patří do repozitáře.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DERIVED_DIR, STATE_FAILED_DIR, STATE_PHOTOS_DIR, ensureDataDirs } from '../dataDir.js';
import { processUploadedPhoto } from '../photoProcessing.js';

ensureDataDirs();

const GALLERY_MEDIA = path.join(os.homedir(), 'Pictures', 'MH-web', 'GalleryMedia');
const hasRealTestData = fs.existsSync(GALLERY_MEDIA);

// Otisk se v produkci počítá z bajtů, které server skutečně přijal (viz
// upload.js) — tady čteme přímo z disku, což je pro test na read-only
// zdroji rovnocenné.
async function sha256Of(filePath) {
	const crypto = await import('node:crypto');
	const data = await fsp.readFile(filePath);
	return `sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;
}

async function cleanupKey(key) {
	await fsp.unlink(path.join(STATE_PHOTOS_DIR, `${key}.json`)).catch(() => {});
	await fsp.unlink(path.join(STATE_FAILED_DIR, `${key}.json`)).catch(() => {});
	const derived = await fsp.readdir(DERIVED_DIR).catch(() => []);
	await Promise.all(
		derived
			.filter((name) => name.startsWith(`${key}_`))
			.map((name) => fsp.unlink(path.join(DERIVED_DIR, name))),
	);
}

test(
	'processUploadedPhoto: jediné klíčové slovo jako holý řetězec (Past 1, případ A)',
	{ skip: !hasRealTestData && 'testovací sada GalleryMedia na tomto stroji chybí' },
	async () => {
		const originalPath = path.join(GALLERY_MEDIA, 'GLR-DSC07950-.jpg');
		const key = 'test--past1-jediny-retezec';
		await cleanupKey(key);
		try {
			const hash = await sha256Of(originalPath);
			const vysledek = await processUploadedPhoto({ key, hash, rawPath: 'Test/a.jpg', originalPath });

			assert.equal(vysledek.zpracovano, true);
			assert.deepEqual(vysledek.record.klicovaSlova, ['Scotland']);
			assert.equal(vysledek.record.odvozene.length, 3);
		} finally {
			await cleanupKey(key);
		}
	},
);

test(
	'processUploadedPhoto: číselné klíčové slovo 2026 + česká diakritika (Past 1, případ B)',
	{ skip: !hasRealTestData && 'testovací sada GalleryMedia na tomto stroji chybí' },
	async () => {
		const originalPath = path.join(GALLERY_MEDIA, 'GLR-DSC04631-BezpecneNaVodu.jpg');
		const key = 'test--past1-cislo-a-diakritika';
		await cleanupKey(key);
		try {
			const hash = await sha256Of(originalPath);
			const vysledek = await processUploadedPhoto({ key, hash, rawPath: 'Test/b.jpg', originalPath });

			assert.equal(vysledek.zpracovano, true);
			// "2026" musí být string, ne number — jinak by JSON.stringify/parse
			// sice přežilo, ale filtrování podle klíčového slova v budoucí
			// galerii (string porovnání) by na čísle tiše selhalo.
			assert.ok(vysledek.record.klicovaSlova.includes('2026'));
			assert.equal(typeof vysledek.record.klicovaSlova.find((k) => k === '2026'), 'string');
			// Česká diakritika musí přežít beze změny (XMP je UTF-8, na rozdíl
			// od starého IPTC IIM).
			assert.ok(vysledek.record.klicovaSlova.includes('bezpečnost'));
			assert.ok(vysledek.record.klicovaSlova.some((k) => k.includes('Vodní záchranná služba')));
		} finally {
			await cleanupKey(key);
		}
	},
);

test(
	'processUploadedPhoto: fotka bez klíčových slov se zpracuje s prázdným seznamem',
	{ skip: !hasRealTestData && 'testovací sada GalleryMedia na tomto stroji chybí' },
	async () => {
		// V reálné sbírce nemá žádná fotka prázdná klíčová slova (ověřeno
		// probe skriptem), takže se tenhle případ simuluje kopií reálné fotky
		// se sharp() odstraněnými metadaty — samotná pixelová data i dál patří
		// mezi "skutečná data", jen bez XMP.
		const zdroj = path.join(GALLERY_MEDIA, 'GLR-DSC00074-Dryied.jpg');
		const sharpMod = await import('sharp');
		const sharp = sharpMod.default;
		const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mhw-test-bez-keywords-'));
		const bezMetadat = path.join(tmpDir, 'bez-metadat.jpg');
		// sharp bez volání `withMetadata()` metadata ve výstupu záměrně
		// nenechává (to je jeho výchozí chování) — přesně to je tu potřeba:
		// stejná pixelová data reálné fotky, ale bez XMP bloku.
		await sharp(zdroj).jpeg().toFile(bezMetadat);

		const key = 'test--bez-klicovych-slov';
		await cleanupKey(key);
		try {
			const hash = await sha256Of(bezMetadat);
			const vysledek = await processUploadedPhoto({
				key,
				hash,
				rawPath: 'Test/c.jpg',
				originalPath: bezMetadat,
			});

			assert.equal(vysledek.zpracovano, true);
			assert.deepEqual(vysledek.record.klicovaSlova, []);
		} finally {
			await cleanupKey(key);
			await fsp.rm(tmpDir, { recursive: true, force: true });
		}
	},
);

test('processUploadedPhoto: poškozený (useknutý) soubor skončí ve failed/, běh pokračuje', async () => {
	// Syntetická poškozená fotka (viz deriveImages.test.js pro generování) —
	// nezávisí na tom, jestli je testovací sbírka na stroji dostupná.
	const sharpMod = await import('sharp');
	const sharp = sharpMod.default;
	const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mhw-test-poskozeny-'));
	const celyPath = path.join(tmpDir, 'cely.jpg');
	await sharp({ create: { width: 800, height: 600, channels: 3, background: '#336699' } })
		.jpeg()
		.toFile(celyPath);
	const cely = await fsp.readFile(celyPath);
	const useknutyPath = path.join(tmpDir, 'usekle-30.jpg');
	await fsp.writeFile(useknutyPath, cely.subarray(0, Math.floor(cely.length * 0.3)));

	const key = 'test--poskozeny-soubor';
	await cleanupKey(key);
	try {
		const hash = 'sha256:test-poskozeny';
		const vysledek = await processUploadedPhoto({
			key,
			hash,
			rawPath: 'Test/d.jpg',
			originalPath: useknutyPath,
		});

		assert.equal(vysledek.zpracovano, false);
		assert.ok(vysledek.chyba, 'chybová hláška musí být vyplněná');

		const failedRaw = await fsp.readFile(path.join(STATE_FAILED_DIR, `${key}.json`), 'utf8');
		const failed = JSON.parse(failedRaw);
		assert.equal(failed.klic, key);
		assert.equal(failed.otisk, hash);

		// Žádný záznam "hotovo" nesmí vzniknout pro poškozenou fotku.
		await assert.rejects(() => fsp.access(path.join(STATE_PHOTOS_DIR, `${key}.json`)));

		// Opakovaný upload STEJNÉHO obsahu (stejný otisk) se nemá znovu
		// zkoušet zpracovávat — viz "opakovaneSelhani" v zadání.
		const podruhe = await processUploadedPhoto({
			key,
			hash,
			rawPath: 'Test/d.jpg',
			originalPath: useknutyPath,
		});
		assert.equal(podruhe.zpracovano, false);
		assert.equal(podruhe.opakovaneSelhani, true);
	} finally {
		await cleanupKey(key);
		await fsp.rm(tmpDir, { recursive: true, force: true });
	}
});
