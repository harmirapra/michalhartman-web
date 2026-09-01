// Sdílené typy a pomocné funkce nad /api/index.json — používá je jak
// MediaGalerie.astro (mřížka fotek s lightboxem), tak rozcestník na
// /gallery/ (jedna vybraná fotka na dlaždici, žádný lightbox). Držet na
// jednom místě, aby se pravidlo shody klíčového slova a filtr
// zobrazitelnosti nerozjely do dvou mírně odlišných kopií (fáze 6).
//
// Čisté funkce (urlOdvozene/jeZobrazitelna/odpovidaKlicovemuSlovu) žijí
// v fotkyJadro.js (obyčejný ESM, umí ho importovat i Node — server/ogFoto.js)
// a tady se jen re-exportují, ať se import v komponentách nemusí měnit.

export { urlOdvozene, jeZobrazitelna, odpovidaKlicovemuSlovu } from "./fotkyJadro.js";

export interface OdvozenaVelikost {
	velikost: number;
	soubor: string;
}

export interface Fotka {
	klic: string;
	rozmery?: { sirka: number; vyska: number };
	titulek?: string | null;
	klicovaSlova?: unknown;
	autor?: string | null;
	licence?: string | null;
	odvozene?: OdvozenaVelikost[];
}

export interface Index {
	fotky?: Fotka[];
}

// Načte a naparsuje /api/index.json. Skutečná selhání (síť, neplatný JSON)
// nechává vyhodit — volající je zaloguje přes console.error. Prázdný
// výsledek po filtrování NENÍ chyba (viz volající kód), a proto se tady
// neřeší.
export async function nacistIndex(): Promise<Index> {
	const odpoved = await fetch("/api/index.json");
	if (!odpoved.ok) {
		throw new Error(`/api/index.json vrátilo HTTP ${odpoved.status}`);
	}
	return odpoved.json();
}
