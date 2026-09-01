// Čisté funkce nad záznamem fotky — přesunuté sem z fotky.ts, aby je šlo
// importovat i z Node (server/ogFoto.js), ne jen z Astro/prohlížečového
// buildu. Obyčejný ESM soubor bez typů: Node ho umí importovat přímo, `.ts`
// ne. `fotky.ts` odsud tyhle tři funkce re-exportuje, aby se import
// v MediaGalerie.astro/gallery.astro nemusel nikde měnit.

export function urlOdvozene(fotka, velikost) {
	const zaznam = fotka.odvozene?.find((o) => o.velikost === velikost);
	return zaznam ? `/photos/${zaznam.soubor}` : null;
}

// Fotka bez rozměrů nebo bez některé odvozené velikosti se vynechá — bez
// těchhle dat by nešlo bezpečně nastavit width/height (stránka by
// poskakovala) ani napojit lightbox/dlaždici na plnou velikost.
export function jeZobrazitelna(fotka) {
	return Boolean(
		fotka.rozmery?.sirka &&
			fotka.rozmery?.vyska &&
			urlOdvozene(fotka, 600) &&
			urlOdvozene(fotka, 1200) &&
			urlOdvozene(fotka, 2048),
	);
}

export function odpovidaKlicovemuSlovu(fotka, klicLower) {
	const klicovaSlova = fotka.klicovaSlova;
	if (!Array.isArray(klicovaSlova)) return false;
	// Exact match, case insensitive (kontrakt K2/K3) — žádné částečné shody.
	return klicovaSlova.some((k) => String(k).toLowerCase() === klicLower);
}
