// Datový adresář fáze 2: cesta z DATA_DIR (výchozí /data — mount path disku
// v Railway). Vytváří strukturu při startu a ověřuje, že se do ní dá zapisovat.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || '/data';

const ORIGINALS_DIR = path.join(DATA_DIR, 'originals');
const DERIVED_DIR = path.join(DATA_DIR, 'derived');
const STATE_DIR = path.join(DATA_DIR, 'state');
const STATE_PHOTOS_DIR = path.join(DATA_DIR, 'state', 'photos');
const STATE_FAILED_DIR = path.join(DATA_DIR, 'state', 'failed');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
// Fáze 3: servírovaný index a log kolizí klíčů žijí přímo ve state/, ne
// v podsložce — jsou to jednotlivé soubory, ne kolekce záznamů po fotkách.
const INDEX_PATH = path.join(STATE_DIR, 'index.json');
const KOLIZE_PATH = path.join(STATE_DIR, 'kolize.json');

const ALL_DIRS = [ORIGINALS_DIR, DERIVED_DIR, STATE_PHOTOS_DIR, STATE_FAILED_DIR, TMP_DIR];

function probeFileName() {
	return path.join(TMP_DIR, `.zapisovatelnost-${process.pid}-${Date.now()}`);
}

// Volá se jednou při startu. Zjistí, jestli je úložiště připravené, a výsledek
// si zapamatuje — ale NIKDY kvůli tomu neshodí server.
//
// Původně tady byl `throw`. Bylo to špatně: statický web nemá s úložištěm fotek
// nic společného, takže nedostupný disk shodil i stránky, které ho nepotřebují.
// Navíc se to projeví jako restartující se kontejner, tedy nejhůř
// diagnostikovatelný způsob selhání. Nedostupný disk teď vypne jen `/admin/*`,
// zbytek webu běží dál.
let storageError = null;

function ensureDataDirs() {
	try {
		for (const dir of ALL_DIRS) {
			fs.mkdirSync(dir, { recursive: true });
		}
		const probePath = probeFileName();
		fs.writeFileSync(probePath, '');
		fs.unlinkSync(probePath);
		storageError = null;
	} catch (err) {
		storageError = `Datový adresář "${TMP_DIR}" není použitelný (DATA_DIR="${DATA_DIR}"): ${err.message}`;
		console.error(`[úložiště] ${storageError}`);
		console.error('[úložiště] /admin/* bude vracet 503, zbytek webu běží dál.');
	}
}

// Null = úložiště je v pořádku.
function getStorageError() {
	return storageError;
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
	DERIVED_DIR,
	STATE_DIR,
	STATE_PHOTOS_DIR,
	STATE_FAILED_DIR,
	TMP_DIR,
	INDEX_PATH,
	KOLIZE_PATH,
	ensureDataDirs,
	getStorageError,
	getStorageStatus,
};
