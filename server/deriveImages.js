// Generování odvozených velikostí (WebP) z originálu — sharp.
//
// Past 2 ze zadání: tohle je krok, na kterém se pozná useknutý/poškozený
// soubor. `exifr` z něj klíčová slova přečte v pohodě (XMP sedí na začátku
// souboru), ale `sharp` takový soubor musí odmítnout — proto se `failOn`
// NIKDE v tomhle souboru nenastavuje. Výchozí hodnota `'warning'` je záměr,
// ne opomenutí: `failOn: 'none'` by useknutý soubor propustil a vyrobil by
// náhled se šedou spodní částí (ověřeno na skutečných datech).
//
// Barevný profil `withIccProfile('srgb')` jde na všechny velikosti — je menší
// než `keepIccProfile()` a navíc převádí případný budoucí Display P3 export
// zpět do sRGB. Metadata (`withMetadata()`, tedy EXIF/IPTC/XMP včetně
// copyrightu) jdou jen do velikosti 2048 — rozhodnutí Michala 29. 8. 2026,
// viz zadání fáze 3.

import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Dlouhá hrana v pixelech + jestli má výstup nést metadata.
const DERIVED_SIZES = [
	{ velikost: 600, metadata: false },
	{ velikost: 1200, metadata: false },
	{ velikost: 2048, metadata: true },
];

async function renderSize(originalPath, velikost, metadata) {
	let pipeline = sharp(originalPath)
		.resize({ width: velikost, height: velikost, fit: 'inside', withoutEnlargement: true })
		.withIccProfile('srgb');
	if (metadata) {
		pipeline = pipeline.withMetadata();
	}
	// resolveWithObject dá rovnou i skutečné rozměry výstupu — nemusí se kvůli
	// nim volat druhé sharp().metadata() nad hotovým bufferem.
	const { data, info } = await pipeline.webp().toBuffer({ resolveWithObject: true });
	return { data, width: info.width, height: info.height };
}

// key: klíč fotky. hash6: prvních 6 znaků otisku obsahu originálu (jde do
// názvu souboru, aby se roční immutable cache obešla sama při každé změně
// obsahu). tmpDir/derivedDir: z dataDir.js.
//
// Vrací { rozmery: {sirka, vyska}, odvozene: [{velikost, soubor}, …] }.
// Rozměry jsou z výstupu 2048 (tj. z toho, co se skutečně servíruje
// v lightboxu), ne z originálu — pro `width`/`height` atributy na webu je
// tohle to správné číslo.
//
// Nikdy sama neuklízí — když prostřední velikost selže, předchozí už
// přejmenovaná velikost zůstane v derived/ jako osiřelý soubor. To je
// vědomé rozhodnutí návrhu (viz zadání), ne nedopatření.
async function generateDerivedImages({ originalPath, key, hash6, tmpDir, derivedDir }) {
	const odvozene = [];
	let rozmery = null;

	for (const { velikost, metadata } of DERIVED_SIZES) {
		const { data, width, height } = await renderSize(originalPath, velikost, metadata);

		const soubor = `${key}_${velikost}_${hash6}.webp`;
		const tmpSuffix = crypto.randomBytes(8).toString('hex');
		const tmpPath = path.join(tmpDir, `${key}.${velikost}.${tmpSuffix}.tmp`);
		const finalPath = path.join(derivedDir, soubor);

		try {
			await fsp.writeFile(tmpPath, data);
			await fsp.rename(tmpPath, finalPath);
		} catch (err) {
			await fsp.unlink(tmpPath).catch(() => {});
			throw err;
		}

		odvozene.push({ velikost, soubor });
		if (velikost === 2048) {
			rozmery = { sirka: width, vyska: height };
		}
	}

	return { rozmery, odvozene };
}

export { generateDerivedImages, DERIVED_SIZES };
