// index.json — poslepený ze záznamů state/photos/*.json. Slouží
// GET /api/index.json (data pro galerii) a je jediné místo, kde poškození
// znamená, že zmizí všechny galerie naráz — proto dvě pojistky:
//
// 1. Zápis přes `write-file-atomic` (temp + fsync + rename + fsync adresáře).
//    Vlastní `fs.rename` fsync typicky vynechá; na ext4 může po pádu
//    hostitele zůstat pod novým názvem soubor nulové délky.
// 2. Kontrola při startu serveru (`ensureIndexHealthy`): jde index
//    naparsovat? Když ne, přebuduje se ze záznamů — samoopravné bez toho,
//    aby Michal musel pochopit, co se stalo.
//
// POST /admin/rebuild nic nezpracovává, jen skládá `index.json` ze záznamů,
// které už existují. Žádná „opravná role" — ta je zbytečná, protože
// GET /admin/files čte přímo záznamy, ne výpis originals/ (viz adminFiles.js).

import fsp from 'node:fs/promises';
import writeFileAtomic from 'write-file-atomic';
import { INDEX_PATH } from './dataDir.js';
import { readAllPhotoRecords } from './photoRecords.js';

// Pod touhle hranicí (podíl nového počtu fotek k současnému) rebuild odmítne
// vyměnit index, pokud není vynucený — pojistka proti tichému zmenšení
// (bod D1 v návrhu): rebuild neselže, ale vyrobí chudší index, např. kvůli
// dočasně nedostupné podmnožině záznamů.
const MIN_KEEP_RATIO = 0.8;

function buildIndexFromRecords(records) {
	// Stabilní pořadí ve výstupu usnadňuje diffování index.json v gitu/logu
	// (kdyby se někdy zálohoval) a dělá report předvídatelným.
	const fotky = [...records].sort((a, b) => a.klic.localeCompare(b.klic));
	return {
		aktualizovano: new Date().toISOString(),
		fotky,
	};
}

async function readIndexFile() {
	const raw = await fsp.readFile(INDEX_PATH, 'utf8');
	const parsed = JSON.parse(raw);
	if (!parsed || !Array.isArray(parsed.fotky)) {
		throw new Error('index.json nemá očekávaný tvar (chybí pole "fotky").');
	}
	return parsed;
}

async function writeIndexFile(index) {
	await writeFileAtomic(INDEX_PATH, JSON.stringify(index, null, 2));
}

// Volá se jednou při startu serveru. Poškozený/chybějící index se potichu
// (jen log) přebuduje ze záznamů — pět řádků, které dělají z jediné
// katastrofické cesty samoopravnou.
async function ensureIndexHealthy() {
	try {
		await readIndexFile();
		return { rebuilt: false };
	} catch (err) {
		console.error(
			`[index] "${INDEX_PATH}" se nedá použít (${err.message}), přebuduju ze záznamů.`,
		);
		const records = await readAllPhotoRecords();
		const index = buildIndexFromRecords(records);
		await writeIndexFile(index);
		console.error(`[index] přebudováno, ${index.fotky.length} fotek.`);
		return { rebuilt: true, pocetFotek: index.fotky.length };
	}
}

// POST /admin/rebuild. `force` obchází pojistku proti zmenšení — použije se
// vědomě, když Michal ví, že úbytek je v pořádku (např. po `/admin/forget`
// v budoucí fázi).
async function rebuildIndex({ force = false } = {}) {
	const records = await readAllPhotoRecords();
	const novy = buildIndexFromRecords(records);

	let puvodniPocet = null;
	try {
		const soucasny = await readIndexFile();
		puvodniPocet = soucasny.fotky.length;
	} catch {
		// Chybějící/poškozený index při rebuildu není důvod k odmítnutí —
		// naopak přesně tohle rebuild řeší. Bez předchozího počtu se pojistka
		// proti zmenšení neuplatní (není vůči čemu poměřovat).
		puvodniPocet = null;
	}

	if (
		!force &&
		puvodniPocet !== null &&
		puvodniPocet > 0 &&
		novy.fotky.length < puvodniPocet * MIN_KEEP_RATIO
	) {
		const chyba = new Error(
			`Nový index by měl ${novy.fotky.length} fotek místo současných ${puvodniPocet} ` +
				`(pod ${Math.round(MIN_KEEP_RATIO * 100)} %). Výměna odmítnuta, dá se vynutit parametrem force.`,
		);
		chyba.code = 'INDEX_BY_SE_ZMENSIL';
		chyba.puvodniPocet = puvodniPocet;
		chyba.novyPocet = novy.fotky.length;
		throw chyba;
	}

	await writeIndexFile(novy);
	return { puvodniPocet, novyPocet: novy.fotky.length, aktualizovano: novy.aktualizovano };
}

async function readIndexOrEmpty() {
	try {
		return await readIndexFile();
	} catch {
		return { aktualizovano: null, fotky: [] };
	}
}

export { ensureIndexHealthy, rebuildIndex, readIndexOrEmpty, buildIndexFromRecords, MIN_KEEP_RATIO };
