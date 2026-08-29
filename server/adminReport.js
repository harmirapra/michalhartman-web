// GET /admin/report — kontrolní výpis nad obsahem knihovny. Souhrnný řádek
// vždy jako první, pak: klíčová slova od nejvzácnějších (překlep vyskočí
// jako slovo s počtem 1), fotky bez klíčových slov, selhané fotky, kolize
// klíčů a duplicitní obsah (dva klíče se stejným otiskem).

import fsp from 'node:fs/promises';
import { ORIGINALS_DIR } from './dataDir.js';
import { readKolize } from './kolize.js';
import { readAllFailedRecords, readAllPhotoRecords } from './photoRecords.js';
import { readIndexOrEmpty } from './mediaIndex.js';

async function countOriginals() {
	try {
		const entries = await fsp.readdir(ORIGINALS_DIR);
		return entries.filter((name) => !name.startsWith('.')).length;
	} catch {
		return 0;
	}
}

// Seřazené od nejvzácnějších (počet vzestupně), při shodě abecedně —
// deterministický výstup, žádné tiché přeuspořádání mezi voláními.
function countKeywords(records) {
	const counts = new Map();
	for (const record of records) {
		for (const keyword of record.klicovaSlova ?? []) {
			counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
		.map(([klicoveSlovo, pocet]) => ({ klicoveSlovo, pocet }));
}

// Skupiny záznamů podle otisku obsahu, jen skupiny větší než jedna — tatáž
// fotka ve dvou podsložkách, nebo přejmenovaný soubor po opravě (viz zadání).
function findDuplicateContent(records) {
	const byHash = new Map();
	for (const record of records) {
		const skupina = byHash.get(record.otisk) ?? [];
		skupina.push(record.klic);
		byHash.set(record.otisk, skupina);
	}
	return [...byHash.entries()]
		.filter(([, klice]) => klice.length > 1)
		.map(([otisk, klice]) => ({ otisk, klice }));
}

async function handleAdminReport(_req, res) {
	const [pocetOriginalu, photoRecords, failedRecords, index, kolize] = await Promise.all([
		countOriginals(),
		readAllPhotoRecords(),
		readAllFailedRecords(),
		readIndexOrEmpty(),
		readKolize(),
	]);

	const bezKlicovychSlov = photoRecords.filter((r) => (r.klicovaSlova ?? []).length === 0);

	res.status(200).json({
		souhrn: {
			ulozeno: pocetOriginalu,
			vIndexu: index.fotky.length,
			selhalo: failedRecords.length,
			bezKlicovychSlov: bezKlicovychSlov.length,
		},
		klicovaSlova: countKeywords(photoRecords),
		fotkyBezKlicovychSlov: bezKlicovychSlov.map((r) => r.klic),
		selhaneFotky: failedRecords.map((r) => ({
			klic: r.klic,
			otisk: r.otisk,
			chyba: r.chyba,
			selhanoV: r.selhanoV,
		})),
		kolizeKlicu: Object.entries(kolize).map(([klic, zaznam]) => ({
			klic,
			cesty: zaznam.cesty,
			naposledy: zaznam.naposledy,
		})),
		duplicitniObsah: findDuplicateContent(photoRecords),
	});
}

export { handleAdminReport, countKeywords, findDuplicateContent };
