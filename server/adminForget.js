// POST /admin/forget?klic=<klíč> — smaže fotku ze serveru natrvalo: originál,
// všechny odvozené velikosti a záznam (úspěšný i případný neúspěšný). Pak
// přeskládá index.
//
// ⚠️ Vstup se validuje proti seznamu existujících záznamů. Cesta na disku se
// NIKDY neskládá zřetězením s uživatelským řetězcem — jinak je `../../`
// jeden překlep od smazání čehokoliv na disku. Stejný přístup jako u
// POST /admin/upload (viz upload.js): teprve poté, co se požadovaný klíč
// najde mezi existujícími záznamy, se dál pracuje s klíčem z TOHO nalezeného
// záznamu, ne znovu se syrovým `req.query.klic` — i když je v běžném případě
// hodnota stejná (match byl přesný), princip je stejný a je to zadarmo.
//
// `forgetPhoto` je čistá(ější) funkce nad diskem, testovatelná bez mockování
// Express req/res — stejný precedens jako `rebuildIndex` v mediaIndex.js.
// Chyby nesou `.code`, který si `handleAdminForget` překládá na HTTP stav.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { DERIVED_DIR, ORIGINALS_DIR } from './dataDir.js';
import { rebuildIndex } from './mediaIndex.js';
import {
	clearFailedRecord,
	deletePhotoRecord,
	readAllFailedRecords,
	readAllPhotoRecords,
} from './photoRecords.js';
import { isValidKey } from './slug.js';

async function unlinkIfExists(filePath) {
	try {
		await fsp.unlink(filePath);
	} catch (err) {
		if (err.code !== 'ENOENT') {
			throw err;
		}
	}
}

// Smaže všechny odvozené velikosti podle skutečného obsahu derived/, ne jen
// podle toho, co si "myslí" záznam (record.odvozene) — u fotky, jejíž
// zpracování selhalo uprostřed, mohla podle poznámky v deriveImages.js
// ("nikdy sama neuklízí") vzniknout osiřelá velikost bez záznamu. Bezpečné:
// klíč nikdy neobsahuje "_" (viz KEY_PATTERN ve slug.js), takže prefix
// "<klíč>_" nemůže omylem zasáhnout jiný, podobně pojmenovaný klíč.
async function deleteDerivedForKey(key) {
	const entries = await fsp.readdir(DERIVED_DIR).catch(() => []);
	const prefix = `${key}_`;
	const matches = entries.filter((name) => name.startsWith(prefix));
	await Promise.all(matches.map((name) => unlinkIfExists(path.join(DERIVED_DIR, name))));
	return matches.length;
}

function chybaSKodem(zprava, code) {
	const chyba = new Error(zprava);
	chyba.code = code;
	return chyba;
}

async function forgetPhoto(klic) {
	if (typeof klic !== 'string' || klic.length === 0) {
		throw chybaSKodem('Chybí parametr klic.', 'MISSING_KEY');
	}
	if (!isValidKey(klic)) {
		throw chybaSKodem(`Klíč "${klic}" nemá povolený tvar.`, 'INVALID_KEY');
	}

	const [photoRecords, failedRecords] = await Promise.all([
		readAllPhotoRecords(),
		readAllFailedRecords(),
	]);
	const photoRecord = photoRecords.find((r) => r.klic === klic);
	const failedRecord = failedRecords.find((r) => r.klic === klic);

	if (!photoRecord && !failedRecord) {
		throw chybaSKodem(`Klíč "${klic}" mezi záznamy není.`, 'NOT_FOUND');
	}

	const key = (photoRecord ?? failedRecord).klic;

	await unlinkIfExists(path.join(ORIGINALS_DIR, `${key}.jpg`));
	const odvozenychSmazano = await deleteDerivedForKey(key);
	await deletePhotoRecord(key);
	await clearFailedRecord(key);

	const vysledek = await rebuildIndex({ force: true });

	return {
		klic: key,
		odvozenychSmazano,
		puvodniPocetVIndexu: vysledek.puvodniPocet,
		novyPocetVIndexu: vysledek.novyPocet,
	};
}

async function handleAdminForget(req, res) {
	try {
		const vysledek = await forgetPhoto(req.query.klic);
		res.status(200).json({ smazano: true, ...vysledek });
	} catch (err) {
		if (err.code === 'MISSING_KEY' || err.code === 'INVALID_KEY') {
			res.status(400).json({ error: err.code.toLowerCase(), message: err.message });
			return;
		}
		if (err.code === 'NOT_FOUND') {
			res.status(404).json({ error: 'not_found', message: err.message });
			return;
		}
		console.error('Odstranění fotky selhalo:', err);
		res.status(500).json({ error: 'forget_failed' });
	}
}

export { handleAdminForget, forgetPhoto, deleteDerivedForKey };
