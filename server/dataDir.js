// Datový adresář fáze 2: cesta z DATA_DIR (výchozí /data — mount path disku
// v Railway). Vytváří strukturu při startu a ověřuje, že se do ní dá zapisovat.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || '/data';

const ORIGINALS_DIR = path.join(DATA_DIR, 'originals');
const STATE_PHOTOS_DIR = path.join(DATA_DIR, 'state', 'photos');
const STATE_FAILED_DIR = path.join(DATA_DIR, 'state', 'failed');
const TMP_DIR = path.join(DATA_DIR, 'tmp');

const ALL_DIRS = [ORIGINALS_DIR, STATE_PHOTOS_DIR, STATE_FAILED_DIR, TMP_DIR];

function probeFileName() {
	return path.join(TMP_DIR, `.zapisovatelnost-${process.pid}-${Date.now()}`);
}

// Volá se jednou při startu. Když do TMP_DIR nejde zapisovat, server má
// selhat hlasitě hned — ne tiše běžet dál a padat až při prvním uploadu.
function ensureDataDirs() {
	for (const dir of ALL_DIRS) {
		fs.mkdirSync(dir, { recursive: true });
	}

	const probePath = probeFileName();
	try {
		fs.writeFileSync(probePath, '');
		fs.unlinkSync(probePath);
	} catch (err) {
		throw new Error(
			`Datový adresář "${TMP_DIR}" není zapisovatelný (DATA_DIR="${DATA_DIR}"): ${err.message}`,
		);
	}
}

// Diagnostika pro GET /admin/stav — jestli je disk zapisovatelný, kolik je
// tam originálů a kolik zbývá volného místa.
async function getStorageStatus() {
	let writable = true;
	try {
		const probePath = probeFileName();
		await fsp.writeFile(probePath, '');
		await fsp.unlink(probePath);
	} catch {
		writable = false;
	}

	let originalsCount = 0;
	try {
		const entries = await fsp.readdir(ORIGINALS_DIR);
		originalsCount = entries.filter((name) => !name.startsWith('.')).length;
	} catch {
		originalsCount = 0;
	}

	let freeBytes = null;
	try {
		const stats = await fsp.statfs(DATA_DIR);
		freeBytes = stats.bavail * stats.bsize;
	} catch {
		freeBytes = null;
	}

	return { writable, originalsCount, freeBytes };
}

export {
	DATA_DIR,
	ORIGINALS_DIR,
	STATE_PHOTOS_DIR,
	STATE_FAILED_DIR,
	TMP_DIR,
	ensureDataDirs,
	getStorageStatus,
};
