// Čtení a zápis záznamů o fotkách — state/photos/<klíč>.json (značka
// „hotovo") a state/failed/<klíč>.json (chyba zpracování).
//
// Zápis přes `write-file-atomic`: dělá temp + fsync souboru + rename + fsync
// adresáře. Vlastní `tmp + fs.rename` (jako u originálů v upload.js) ten
// fsync typicky vynechá — po pádu hostitele může na ext4 zůstat pod novým
// názvem soubor nulové délky. U jedné fotky by to jen znamenalo, že se
// příště zpracuje znovu (žádná ztráta), ale je to tak levné udělat pořádně
// všude, že není důvod dělat rozdíl mezi „důležitými" a „méně důležitými"
// záznamy.

import fsp from 'node:fs/promises';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import { STATE_PHOTOS_DIR, STATE_FAILED_DIR } from './dataDir.js';

function photoRecordPath(key) {
	return path.join(STATE_PHOTOS_DIR, `${key}.json`);
}

function failedRecordPath(key) {
	return path.join(STATE_FAILED_DIR, `${key}.json`);
}

async function readJsonIfExists(filePath) {
	try {
		const raw = await fsp.readFile(filePath, 'utf8');
		return JSON.parse(raw);
	} catch (err) {
		if (err.code === 'ENOENT') {
			return null;
		}
		throw err;
	}
}

async function readPhotoRecord(key) {
	return readJsonIfExists(photoRecordPath(key));
}

async function readFailedRecord(key) {
	return readJsonIfExists(failedRecordPath(key));
}

// Zápis záznamu „hotovo". Volá se jako úplně poslední krok zpracování —
// jeho existence je jediná definice slova „hotovo" v celém systému.
async function writePhotoRecord(record) {
	await writeFileAtomic(photoRecordPath(record.klic), JSON.stringify(record, null, 2));
}

async function writeFailedRecord(record) {
	await writeFileAtomic(failedRecordPath(record.klic), JSON.stringify(record, null, 2));
}

// Úspěšné zpracování maže případnou starou značku selhání pro týž klíč —
// jinak by se stará chyba (z předchozího, opraveného obsahu) donekonečna
// vlekla v reportu vedle nového, platného záznamu.
async function clearFailedRecord(key) {
	try {
		await fsp.unlink(failedRecordPath(key));
	} catch (err) {
		if (err.code !== 'ENOENT') {
			throw err;
		}
	}
}

async function listJsonFiles(dir) {
	let entries;
	try {
		entries = await fsp.readdir(dir);
	} catch (err) {
		if (err.code === 'ENOENT') {
			return [];
		}
		throw err;
	}
	return entries.filter((name) => name.endsWith('.json'));
}

async function readAllPhotoRecords() {
	const files = await listJsonFiles(STATE_PHOTOS_DIR);
	const records = await Promise.all(
		files.map((name) => readJsonIfExists(path.join(STATE_PHOTOS_DIR, name))),
	);
	return records.filter((r) => r !== null);
}

async function readAllFailedRecords() {
	const files = await listJsonFiles(STATE_FAILED_DIR);
	const records = await Promise.all(
		files.map((name) => readJsonIfExists(path.join(STATE_FAILED_DIR, name))),
	);
	return records.filter((r) => r !== null);
}

export {
	readPhotoRecord,
	readFailedRecord,
	writePhotoRecord,
	writeFailedRecord,
	clearFailedRecord,
	readAllPhotoRecords,
	readAllFailedRecords,
};
