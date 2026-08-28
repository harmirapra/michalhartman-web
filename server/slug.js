// Slugifikace relativní cesty na klíč fotky + validace klíče.
//
// Klíč smí obsahovat jen [a-z0-9], segmenty (podsložka/název) spojené `--`.
// Tenhle tvar je bezpečný sám o sobě — neobsahuje `.` ani `/`, takže se
// nedá použít k útěku z datového adresáře (`../../` apod.). Segment, který
// po slugifikaci zůstane prázdný (typicky `.` nebo `..`), zneplatní celý
// klíč — to je jediná cesta, jak něco jako `../../etc/passwd` skončí na 400
// místo zápisu mimo `originals/`.

const KEY_PATTERN = /^[a-z0-9]+(-{1,2}[a-z0-9]+)*$/;

// Rozsah kombinujících diakritických znamének v Unicode (po NFD normalizaci
// se diakritika odseparuje od základního písmene právě do téhle oblasti).
const COMBINING_MARKS = /[\u0300-\u036f]/g;

function slugifySegment(segment) {
	return segment
		.normalize('NFD')
		.replace(COMBINING_MARKS, '') // odstranit diakritiku
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-') // cokoliv nepovoleného -> jedna pomlčka
		.replace(/-+/g, '-') // sloučit případné vícenásobné pomlčky
		.replace(/^-|-$/g, ''); // oříznout pomlčky na krajích
}

function isValidKey(key) {
	return typeof key === 'string' && KEY_PATTERN.test(key);
}

// relPath: relativní cesta v rámci intake složky, např.
// "Greece/GLR-DSC04130-Enhanced-NR-Milos bay.jpg" -> "greece--glr-dsc04130-enhanced-nr-milos-bay"
// Vrací null, když se cesta nedá bezpečně převést na platný klíč.
function pathToKey(relPath) {
	if (typeof relPath !== 'string' || relPath.length === 0) {
		return null;
	}

	// Odstranit příponu jen z posledního segmentu (poslední ".xxx" v celé cestě).
	const withoutExtension = relPath.replace(/\.[^./\\]+$/, '');
	const trimmed = withoutExtension.replace(/^[/\\]+|[/\\]+$/g, '');
	if (trimmed.length === 0) {
		return null;
	}

	const rawSegments = trimmed.split(/[/\\]+/);
	const slugSegments = rawSegments.map(slugifySegment);

	// Segment jako ".." nebo "." slugifikací zmizí (zůstane prázdný řetězec) —
	// to je záměrně důvod k zamítnutí, ne k tichému přeskočení.
	if (slugSegments.some((segment) => segment.length === 0)) {
		return null;
	}

	const key = slugSegments.join('--');
	return isValidKey(key) ? key : null;
}

export { KEY_PATTERN, slugifySegment, isValidKey, pathToKey };
