// POST /admin/upload — přijme jedinou fotku a uloží ji do originals/.
//
// Klient posílá relativní cestu v rámci intake složky v query parametru
// `path` (např. "Greece/GLR-DSC04130-Enhanced-NR-Milos bay.jpg") a syrová
// data fotky jako tělo požadavku. Server z cesty odvodí klíč (slugifikace,
// viz slug.js) a klíč ještě zvlášť ověří proti povolenému tvaru — cesta na
// disku se NIKDY neskládá zřetězením s tím, co pošle klient.
//
// Zápis jde přes dočasný soubor s náhodnou příponou a přejmenování
// (tmp/<klíč>.<náhoda>.tmp -> originals/<klíč>.jpg). Náhodná přípona brání
// tomu, aby si dva souběžné uploady stejného klíče navzájem poškodily data
// v jednom sdíleném dočasném souboru.

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { TMP_DIR, ORIGINALS_DIR } from './dataDir.js';
import { processUploadedPhoto } from './photoProcessing.js';
import { pathToKey, isValidKey } from './slug.js';

// Rozumný strop na jednu fotku, aby chybný/zlomyslný požadavek nezaplnil disk.
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB

class PayloadTooLargeError extends Error {}

async function cleanupTmp(tmpPath) {
	try {
		await fsp.unlink(tmpPath);
	} catch {
		// Soubor už neexistuje (nikdy nevznikl, nebo se ho podařilo smazat jinde) — nevadí.
	}
}

function handleUpload(req, res) {
	const rawPath = req.query.path;
	if (typeof rawPath !== 'string' || rawPath.length === 0) {
		res.status(400).json({ error: 'missing_path', message: 'Chybí parametr path.' });
		return;
	}

	const key = pathToKey(rawPath);
	if (!key || !isValidKey(key)) {
		res
			.status(400)
			.json({ error: 'invalid_key', message: 'Cestu nejde bezpečně převést na klíč.' });
		return;
	}

	const tmpSuffix = crypto.randomBytes(8).toString('hex');
	const tmpPath = path.join(TMP_DIR, `${key}.${tmpSuffix}.tmp`);
	const finalPath = path.join(ORIGINALS_DIR, `${key}.jpg`);

	const hash = crypto.createHash('sha256');
	let bytesSeen = 0;

	// Transform, který zároveň počítá otisk a velikost a hlídá strop —
	// otisk se počítá vždy z toho, co server skutečně přijal, nikdy se
	// nepřebírá od klienta.
	const hashingGuard = new Transform({
		transform(chunk, _encoding, callback) {
			bytesSeen += chunk.length;
			if (bytesSeen > MAX_UPLOAD_BYTES) {
				callback(new PayloadTooLargeError('Soubor přesahuje povolený limit.'));
				return;
			}
			hash.update(chunk);
			callback(null, chunk);
		},
	});

	const writeStream = fs.createWriteStream(tmpPath);

	pipeline(req, hashingGuard, writeStream)
		.then(async () => {
			await fsp.rename(tmpPath, finalPath);
			const hashHex = `sha256:${hash.digest('hex')}`;

			// Od tohohle místa je originál uložený natrvalo bez ohledu na to, co
			// se stane dál — proto je zpracování v samostatném try/catch.
			// Nepředvídaná chyba tady (na rozdíl od chyby uvnitř
			// processUploadedPhoto, kterou si ošetřuje a hlásí sama) nesmí spadnout
			// do větve "upload_failed" níže: ta by tvrdila, že se upload nepovedl,
			// zatímco soubor v originals/ v pořádku leží.
			let vysledek;
			try {
				vysledek = await processUploadedPhoto({
					key,
					hash: hashHex,
					rawPath,
					originalPath: finalPath,
				});
			} catch (err) {
				console.error(`Nečekaná chyba při zpracování fotky "${key}":`, err);
				vysledek = { zpracovano: false, opakovaneSelhani: false, chyba: err.message };
			}

			res.status(200).json({
				key,
				hash: hashHex,
				size: bytesSeen,
				zpracovano: vysledek.zpracovano,
				...(vysledek.zpracovano
					? {}
					: { chyba: vysledek.chyba, opakovaneSelhani: Boolean(vysledek.opakovaneSelhani) }),
			});
		})
		.catch(async (err) => {
			await cleanupTmp(tmpPath);
			if (res.writableEnded) {
				return;
			}
			if (err instanceof PayloadTooLargeError) {
				res.status(413).json({ error: 'payload_too_large' });
				return;
			}
			console.error('Nahrání fotky selhalo:', err);
			res.status(500).json({ error: 'upload_failed' });
		});
}

export { handleUpload, MAX_UPLOAD_BYTES };
