// Testuje generateDerivedImages nad syntetickou fotkou (barevný obdélník
// vygenerovaný sharpem samotným) — nezávisí na reálné testovací sbírce.
// Ověřuje rozměry, pojmenování s otiskem a barevný profil skutečně na
// výstupním souboru přes sharp.metadata() (ne odhadem), jak žádá bod 5
// z „Hotovo, když".

import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { DERIVED_DIR, TMP_DIR, ensureDataDirs } from '../dataDir.js';
import { generateDerivedImages } from '../deriveImages.js';

ensureDataDirs();

async function cleanupDerived(key) {
	const entries = await fsp.readdir(DERIVED_DIR).catch(() => []);
	await Promise.all(
		entries.filter((n) => n.startsWith(`${key}_`)).map((n) => fsp.unlink(path.join(DERIVED_DIR, n))),
	);
}

test('generateDerivedImages: tři velikosti, sRGB profil na všech, metadata jen na 2048', async () => {
	const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mhw-test-derive-'));
	// Landscape 3000×2000 — dlouhá hrana je šířka, ať se ověří i poměr stran.
	const originalPath = path.join(tmpDir, 'original.jpg');
	await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#7a3' } })
		.jpeg({ quality: 90 })
		.toFile(originalPath);

	const key = 'test--derive-velikosti';
	const hash6 = 'abc123';
	await cleanupDerived(key);
	try {
		const { rozmery, odvozene } = await generateDerivedImages({
			originalPath,
			key,
			hash6,
			tmpDir: TMP_DIR,
			derivedDir: DERIVED_DIR,
		});

		assert.equal(odvozene.length, 3);
		assert.deepEqual(
			odvozene.map((o) => o.velikost),
			[600, 1200, 2048],
		);
		for (const { velikost, soubor } of odvozene) {
			assert.equal(soubor, `${key}_${velikost}_${hash6}.webp`);
		}

		// Rozměry vrácené funkcí musí odpovídat velikosti 2048 (poměr stran
		// 3000:2000 = 3:2, dlouhá hrana 2048 -> 2048×1365).
		assert.equal(rozmery.sirka, 2048);
		assert.equal(rozmery.vyska, Math.round((2000 / 3000) * 2048));

		for (const { velikost, soubor } of odvozene) {
			const meta = await sharp(path.join(DERIVED_DIR, soubor)).metadata();
			assert.equal(meta.format, 'webp');
			assert.equal(meta.space, 'srgb');
			assert.ok(meta.icc, `velikost ${velikost} musí mít ICC profil`);
			// Dlouhá hrana nesmí přesáhnout cílovou hodnotu (fit: inside).
			assert.ok(Math.max(meta.width, meta.height) <= velikost);
			if (velikost === 2048) {
				assert.ok(meta.exif, '2048 musí nést EXIF (withMetadata())');
			} else {
				assert.ok(!meta.exif, `${velikost} nesmí nést EXIF`);
			}
		}
	} finally {
		await cleanupDerived(key);
		await fsp.rm(tmpDir, { recursive: true, force: true });
	}
});

test('generateDerivedImages: useknutý soubor vyhodí chybu (sharp na failOn: warning)', async () => {
	const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mhw-test-derive-usekle-'));
	const celyPath = path.join(tmpDir, 'cely.jpg');
	await sharp({ create: { width: 1000, height: 800, channels: 3, background: '#a33' } })
		.jpeg()
		.toFile(celyPath);
	const cely = await fsp.readFile(celyPath);
	const useknutyPath = path.join(tmpDir, 'usekle.jpg');
	await fsp.writeFile(useknutyPath, cely.subarray(0, Math.floor(cely.length * 0.3)));

	const key = 'test--derive-usekly';
	await cleanupDerived(key);
	try {
		await assert.rejects(() =>
			generateDerivedImages({
				originalPath: useknutyPath,
				key,
				hash6: 'zzz999',
				tmpDir: TMP_DIR,
				derivedDir: DERIVED_DIR,
			}),
		);

		// Nesmí zůstat žádný částečně zapsaný soubor v derived/ pro tenhle klíč.
		const entries = await fsp.readdir(DERIVED_DIR);
		assert.equal(entries.filter((n) => n.startsWith(`${key}_`)).length, 0);
	} finally {
		await cleanupDerived(key);
		await fsp.rm(tmpDir, { recursive: true, force: true });
	}
});
