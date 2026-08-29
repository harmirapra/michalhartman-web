// Orchestrace zpracování jedné fotky po uložení originálu. Volá se z
// POST /admin/upload, hned po přejmenování originálu do originals/.
//
// Pořadí kroků (Past 2 ze zadání — NESMÍ SE OBRÁTIT):
//   1. přečti XMP
//   2. vygeneruj náhledy      ← tady se pozná useknutý soubor (sharp odmítne,
//                                exifr by klíčová slova přečetl i z useknutého)
//   3. (náhledy se přejmenovávají do derived/ uvnitř generateDerivedImages)
//   4. zapiš záznam           ← značka „hotovo", VŽDY POSLEDNÍ
//
// Kdyby se pořadí obrátilo, mohla by vzniknout fotka v indexu, kterou nejde
// vykreslit.

import { DERIVED_DIR, TMP_DIR } from './dataDir.js';
import { generateDerivedImages } from './deriveImages.js';
import { checkKeyCollision } from './kolize.js';
import { readXmpMetadata } from './metadata.js';
import {
	clearFailedRecord,
	readFailedRecord,
	readPhotoRecord,
	writeFailedRecord,
	writePhotoRecord,
} from './photoRecords.js';

// originalPath: cesta k originálu na disku (originals/<key>.jpg, už
// přejmenovaný z tmp/ — viz upload.js). hash: "sha256:<hex>" spočtený
// serverem ze skutečně přijatých bajtů (nikdy z toho, co tvrdí klient).
// rawPath: relativní cesta, kterou poslal klient (pro detekci kolizí a pro
// dohledatelnost v záznamu).
async function processUploadedPhoto({ key, hash, rawPath, originalPath }) {
	const existingFailed = await readFailedRecord(key);
	if (existingFailed && existingFailed.otisk === hash) {
		// Stejný obsah už jednou selhal — nezkoušet znovu donekonečna.
		// Zkusí se, teprve až se obsah (a tedy otisk) změní.
		return { zpracovano: false, opakovaneSelhani: true, chyba: existingFailed.chyba };
	}

	const existingRecord = await readPhotoRecord(key);
	const kolize = await checkKeyCollision(key, existingRecord?.puvodniCesta ?? null, rawPath);
	if (kolize) {
		console.error(
			`[kolize] klíč "${key}" už měl jinou zdrojovou cestu ("${existingRecord?.puvodniCesta}" vs "${rawPath}") — zapsáno do state/kolize.json.`,
		);
	}

	const hash6 = hash.replace(/^sha256:/, '').slice(0, 6);

	let metadata;
	let derived;
	try {
		metadata = await readXmpMetadata(originalPath);
		derived = await generateDerivedImages({
			originalPath,
			key,
			hash6,
			tmpDir: TMP_DIR,
			derivedDir: DERIVED_DIR,
		});
	} catch (err) {
		await writeFailedRecord({
			klic: key,
			otisk: hash,
			chyba: err.message,
			selhanoV: new Date().toISOString(),
		});
		return { zpracovano: false, opakovaneSelhani: false, chyba: err.message };
	}

	const record = {
		klic: key,
		otisk: hash,
		puvodniCesta: rawPath,
		rozmery: derived.rozmery,
		titulek: metadata.titulek,
		klicovaSlova: metadata.klicovaSlova,
		autor: metadata.autor,
		licence: metadata.licence,
		odvozene: derived.odvozene,
		zpracovanoV: new Date().toISOString(),
	};

	// Značka „hotovo" — vždy jako úplně poslední krok.
	await writePhotoRecord(record);
	await clearFailedRecord(key);

	return { zpracovano: true, record };
}

export { processUploadedPhoto };
