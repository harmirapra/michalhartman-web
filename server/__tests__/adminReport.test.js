// Čisté pomocné funkce z /admin/report — bez dotyku na disk, takže se dají
// testovat nezávisle na zbytku procesu. Ověřený příklad z reálných dat
// (klíčové slovo „Scotland. Threshnish“ s počtem 1 kvůli překlepu) je tu
// reprodukovaný jako regresní test řazení.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countKeywords, findDuplicateContent } from '../adminReport.js';

test('countKeywords: řadí od nejvzácnějších, při shodě abecedně', () => {
	const records = [
		{ klicovaSlova: ['Scotland', 'bird'] },
		{ klicovaSlova: ['Scotland', 'puffin'] },
		{ klicovaSlova: ['Scotland', 'Scotland. Threshnish'] },
	];

	const result = countKeywords(records);

	// Pořadí uvnitř skupiny se stejným počtem (tady všechny s pocet: 1) jde
	// podle `localeCompare` — to řadí bez ohledu na velikost písmen dřív,
	// takže "bird" a "puffin" předchází "Scotland. Threshnish". Podstatné
	// pro tenhle test je hlavně to, že cokoliv s pocet: 1 je PŘED "Scotland"
	// (pocet: 3) — typo tak v reportu vyskočí hned na začátku, ne uprostřed.
	assert.deepEqual(result, [
		{ klicoveSlovo: 'bird', pocet: 1 },
		{ klicoveSlovo: 'puffin', pocet: 1 },
		{ klicoveSlovo: 'Scotland. Threshnish', pocet: 1 },
		{ klicoveSlovo: 'Scotland', pocet: 3 },
	]);
});

test('countKeywords: chybějící klicovaSlova (obranně) se počítá jako prázdné', () => {
	assert.deepEqual(countKeywords([{ klic: 'a' }, { klic: 'b', klicovaSlova: [] }]), []);
});

test('findDuplicateContent: skupiny se stejným otiskem, jen ty s víc než jedním klíčem', () => {
	const records = [
		{ klic: 'greece--dsc1', otisk: 'sha256:aaa' },
		{ klic: 'root--dsc1', otisk: 'sha256:aaa' },
		{ klic: 'scotland--dsc2', otisk: 'sha256:bbb' },
	];

	assert.deepEqual(findDuplicateContent(records), [
		{ otisk: 'sha256:aaa', klice: ['greece--dsc1', 'root--dsc1'] },
	]);
});

test('findDuplicateContent: bez duplicit vrací prázdné pole', () => {
	const records = [
		{ klic: 'a', otisk: 'sha256:aaa' },
		{ klic: 'b', otisk: 'sha256:bbb' },
	];
	assert.deepEqual(findDuplicateContent(records), []);
});
