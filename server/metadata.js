// Čtení metadat z XMP bloku uvnitř JPEG. Záměrně XMP, ne staré IPTC IIM —
// to používá Windows-1250/MacRoman a rozbíjí českou diakritiku, zatímco XMP
// je vždycky UTF-8 (viz outputs/2026-08-28-galerie-architektura.md).
//
// `mergeOutput: false` je tu podstatné: bez něj exifr slije všechny bloky
// (EXIF, IPTC, XMP, Lightroom presety…) do jedné ploché struktury a `dc:*`
// pole se přejmenují/promíchají s ostatními. S `mergeOutput: false` zůstane
// Dublin Core blok pod `parsed.dc`, přesně jak to čeká normalizace klíčových
// slov níže.

import exifr from 'exifr';

const EXIFR_OPTIONS = {
	xmp: true,
	iptc: false,
	exif: false,
	tiff: false,
	mergeOutput: false,
};

// Past 1 (ověřeno na 169 skutečných souborech): `exifr` rozbaluje jednoprvkové
// RDF kontejnery. `dc:subject` tak nepřijde vždy jako pole:
//   - 3 soubory: jediné klíčové slovo přijde jako holý řetězec ("Scotland")
//   - 122 souborů: klíčové slovo "2026" přijde jako číslo (ne text) uvnitř pole
// Běžné `keywords.map(k => k.toLowerCase())` by na těch 122 souborech spadlo.
// Normalizace se dělá přesně tady, hned po parse, nikde jinde v kódu.
function normalizeKeywords(subject) {
	const s = subject;
	return (s === undefined ? [] : Array.isArray(s) ? s : [s]).map((k) =>
		String(k).normalize('NFC').trim(),
	);
}

// Stejná rodina RDF kontejnerů postihuje i skalární pole (`dc:title`,
// `dc:creator`, `dc:rights`) — `exifr` je může vrátit jako obyčejný řetězec,
// jako pole (víc autorů) nebo jako "LangAlt" objekt `{ lang, value }`
// (`dc:title`/`dc:rights` jsou v XMP jazykové alternativy). Zadání tuhle
// normalizaci výslovně žádá jen pro klíčová slova, ale stejná příčina
// (jednoprvkový RDF kontejner) platí i tady, tak se ošetřuje stejně
// obranně — jinak by `dc:title` typu LangAlt objekt skončil v záznamu
// jako "[object Object]".
function normalizeScalar(value) {
	let v = value;
	if (Array.isArray(v)) {
		v = v[0];
	}
	if (v !== null && typeof v === 'object' && 'value' in v) {
		v = v.value;
	}
	if (v === undefined || v === null || v === '') {
		return null;
	}
	return String(v).normalize('NFC').trim() || null;
}

// Vrací { klicovaSlova, titulek, autor, licence }. Nikdy nevyhazuje kvůli
// chybějícím polím — chybějící metadata jsou legitimní stav (fotka bez
// klíčových slov), ne chyba. Vyhodí jen když se soubor vůbec nedá
// rozparsovat (např. není to platný JPEG) — to volající považuje za
// selhání zpracování stejně jako selhání `sharp`.
async function readXmpMetadata(filePath) {
	const parsed = await exifr.parse(filePath, EXIFR_OPTIONS);
	const dc = parsed?.dc;
	return {
		klicovaSlova: normalizeKeywords(dc?.subject),
		titulek: normalizeScalar(dc?.title),
		autor: normalizeScalar(dc?.creator),
		licence: normalizeScalar(dc?.rights),
	};
}

export { readXmpMetadata, normalizeKeywords, normalizeScalar };
