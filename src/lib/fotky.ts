// Sdílené typy a pomocné funkce nad /api/index.json — používá je jak
// MediaGalerie.astro (mřížka fotek s lightboxem), tak rozcestník na
// /gallery/ (jedna vybraná fotka na dlaždici, žádný lightbox). Držet na
// jednom místě, aby se pravidlo shody klíčového slova a filtr
// zobrazitelnosti nerozjely do dvou mírně odlišných kopií (fáze 6).

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

export function urlOdvozene(fotka: Fotka, velikost: number): string | null {
	const zaznam = fotka.odvozene?.find((o) => o.velikost === velikost);
	return zaznam ? `/photos/${zaznam.soubor}` : null;
}

// Fotka bez rozměrů nebo bez některé odvozené velikosti se vynechá — bez
// těchhle dat by nešlo bezpečně nastavit width/height (stránka by
// poskakovala) ani napojit lightbox/dlaždici na plnou velikost.
export function jeZobrazitelna(fotka: Fotka): boolean {
	return Boolean(
		fotka.rozmery?.sirka &&
			fotka.rozmery?.vyska &&
			urlOdvozene(fotka, 600) &&
			urlOdvozene(fotka, 1200) &&
			urlOdvozene(fotka, 2048),
	);
}

export function odpovidaKlicovemuSlovu(fotka: Fotka, klicLower: string): boolean {
	const klicovaSlova = fotka.klicovaSlova;
	if (!Array.isArray(klicovaSlova)) return false;
	// Exact match, case insensitive (kontrakt K2/K3) — žádné částečné shody.
	return klicovaSlova.some((k) => String(k).toLowerCase() === klicLower);
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
