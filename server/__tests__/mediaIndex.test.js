// buildIndexFromRecords je čistá funkce (žádný dotyk na disk) — souborová
// mechanika (write-file-atomic, pojistka proti zmenšení, samooprava při
// startu) je pokrytá integračním testem `rebuild.test.js`, kde má smysl
// sdílet jeden dočasný DATA_DIR mezi testy.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildIndexFromRecords } from '../mediaIndex.js';

test('buildIndexFromRecords: řadí fotky podle klíče, nese aktualizovano', () => {
	const records = [{ klic: 'zebra--foto' }, { klic: 'alfa--foto' }, { klic: 'beta--foto' }];
	const index = buildIndexFromRecords(records);

	assert.deepEqual(
		index.fotky.map((f) => f.klic),
		['alfa--foto', 'beta--foto', 'zebra--foto'],
	);
	assert.ok(typeof index.aktualizovano === 'string' && index.aktualizovano.length > 0);
	// Musí to být platné ISO datum, ne jen libovolný řetězec.
	assert.ok(!Number.isNaN(Date.parse(index.aktualizovano)));
});

test('buildIndexFromRecords: prázdný seznam záznamů -> prázdný index, ne chyba', () => {
	const index = buildIndexFromRecords([]);
	assert.deepEqual(index.fotky, []);
});
