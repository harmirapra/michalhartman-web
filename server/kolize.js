// Kolize klíčů: dvě různé relativní cesty ve vstupní složce, které se
// slugifikací (server/slug.js) sesypou do stejného klíče. Klíč je odvozený
// z cesty, ne z obsahu — narazit na tohle jde jen tehdy, když se dvě různé
// fotky jmenují/leží tak, že se po normalizaci nedají rozlišit
// (např. "Foo Bar.jpg" a "foo-bar.jpg" ve stejné podsložce).
//
// Detekuje se při uploadu (upload.js volá `checkKeyCollision` před
// přepsáním záznamu) a loguje do state/kolize.json — bez perzistence by
// zpráva zmizela v okamžiku, kdy nový záznam přepíše starý, a report by
// kolizi nikdy neukázal.
//
// V reálné sbírce (169 souborů, ~/Pictures/MH-web/GalleryMedia) se skutečná
// kolize nevyskytuje — ověřeno syntetickým testem (server/__tests__), ne na
// datech, protože ta cíleně nemám sahat.

import writeFileAtomic from 'write-file-atomic';
import fsp from 'node:fs/promises';
import { KOLIZE_PATH } from './dataDir.js';

async function readKolize() {
	try {
		const raw = await fsp.readFile(KOLIZE_PATH, 'utf8');
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch (err) {
		if (err.code === 'ENOENT') {
			return {};
		}
		// Poškozený log kolizí není katastrofa jako poškozený index.json —
		// stačí ho tiše začít znovu, ne shodit upload kvůli diagnostickému
		// vedlejšímu souboru.
		console.error(`[kolize] "${KOLIZE_PATH}" se nedá přečíst (${err.message}), začínám znovu.`);
		return {};
	}
}

// Zavolat PŘED přepsáním záznamu, s cestou uloženou v předchozím záznamu
// (nebo null, když záznam pro klíč ještě neexistuje) a s cestou nového
// uploadu. Když se liší, zapíše se/aktualizuje záznam v state/kolize.json.
async function checkKeyCollision(key, predchoziCesta, novaCesta) {
	if (!predchoziCesta || predchoziCesta === novaCesta) {
		return false;
	}

	const kolize = await readKolize();
	const zaznam = kolize[key] || { cesty: [] };
	const cesty = new Set(zaznam.cesty);
	cesty.add(predchoziCesta);
	cesty.add(novaCesta);
	kolize[key] = { cesty: [...cesty], naposledy: new Date().toISOString() };

	await writeFileAtomic(KOLIZE_PATH, JSON.stringify(kolize, null, 2));
	return true;
}

export { checkKeyCollision, readKolize };
