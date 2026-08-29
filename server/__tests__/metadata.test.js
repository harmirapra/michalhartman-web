// Past 1 ze zadani faze 3: `exifr` nevraci `dc:subject` vzdy jako pole
// retezcu (overeno na 169 skutecnych souborech - 3x holy retezec, 122x
// pole obsahujici cislo). Testy tady reprodukuji presne ty tvary, aby
// regrese v normalizaci spadla hned, ne az pri rucnim behu nad realnymi daty.
//
// Poznamka ke kodovani: soubor je zapsany bez diakritiky, protoze editacni
// nastroj pri prvnim pokusu opakovane neuspesne matchoval retezce s
// diakritikou v komentarich (pravdepodobne kvuli em dash / pitvornym
// znakum v puvodnim zapisu) - obsah testu (assercí) tim neni dotcen.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeKeywords, normalizeScalar } from '../metadata.js';

test('normalizeKeywords: undefined -> prazdne pole (fotka bez klicovych slov)', () => {
	assert.deepEqual(normalizeKeywords(undefined), []);
});

test('normalizeKeywords: holy retezec -> pole s jednim prvkem (Past 1, pripad A)', () => {
	assert.deepEqual(normalizeKeywords('Scotland'), ['Scotland']);
});

test('normalizeKeywords: pole s cislem uvnitr -> string beze zmeny hodnoty (Past 1, pripad B)', () => {
	assert.deepEqual(normalizeKeywords([2026, 'bezpecnost', 'jachting']), [
		'2026',
		'bezpecnost',
		'jachting',
	]);
});

test('normalizeKeywords: hole cislo -> pole s jednim retezcovym prvkem', () => {
	assert.deepEqual(normalizeKeywords(2026), ['2026']);
});

test('normalizeKeywords: NFC normalizace a oriznuti mezer', () => {
	// Sestaveno explicitne z kodovych bodu, aby test nezavisel na tom, v jake
	// normalizacni forme editor ulozi znak primo v souboru. "e" + kombinujici
	// akcent (U+0301) je NFD tvar; po normalizaci musi dat stejny vysledek
	// jako predslozeny znak U+00E9 (NFC) - jinak by se vizualne stejne slovo
	// v reportu pocitalo jako dve ruzna klicova slova.
	const nfdCafe = `caf${String.fromCharCode(0x65, 0x0301)}`;
	const nfcCafe = `caf${String.fromCharCode(0xe9)}`;
	assert.notEqual(nfdCafe, nfcCafe, 'test si musi byt jisty, ze vstup opravdu je v NFD tvaru');
	assert.equal(nfdCafe.normalize('NFC'), nfcCafe);

	const [normalized] = normalizeKeywords([`  ${nfdCafe}  `]);
	assert.equal(normalized, nfcCafe);
});

test('normalizeScalar: undefined/null/prazdny retezec -> null', () => {
	assert.equal(normalizeScalar(undefined), null);
	assert.equal(normalizeScalar(null), null);
	assert.equal(normalizeScalar(''), null);
	assert.equal(normalizeScalar('   '), null);
});

test('normalizeScalar: obycejny retezec beze zmeny (krome oriznuti)', () => {
	assert.equal(normalizeScalar('  Michal Hartman  '), 'Michal Hartman');
});

test('normalizeScalar: LangAlt objekt ({lang, value}) -> jen value', () => {
	assert.equal(normalizeScalar({ lang: 'x-default', value: 'Puffin' }), 'Puffin');
});

test('normalizeScalar: pole (vic autoru) -> prvni prvek', () => {
	assert.equal(normalizeScalar(['Michal Hartman', 'Druhy autor']), 'Michal Hartman');
});

test('normalizeScalar: cislo -> textova podoba', () => {
	assert.equal(normalizeScalar(2026), '2026');
});
