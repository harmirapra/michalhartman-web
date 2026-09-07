// Integrační testy nad skutečným (dočasným) souborovým systémem — styl podle
// rebuild.test.js. req/res se nemockuje knihovnou (repo mocky nepoužívá
// nikde jinde), jen minimální fake objekt s API, které handlery skutečně
// volají.

import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { test } from 'node:test';
import { ensureDataDirs, MY_FILES_DIR, MY_FILES_MANIFEST_PATH } from '../dataDir.js';
import { handleMyFilesList, handleMyFilesUpload } from '../myFiles.js';

ensureDataDirs();

function fakeRes() {
	const res = {
		statusCode: null,
		body: null,
		status(code) {
			res.statusCode = code;
			return res;
		},
		json(payload) {
			res.body = payload;
			return res;
		},
		type() {
			return res;
		},
		send(payload) {
			res.body = payload;
			return res;
		},
	};
	return res;
}

async function clearManifest() {
	await fsp.rm(MY_FILES_MANIFEST_PATH, { force: true });
	const entries = await fsp.readdir(MY_FILES_DIR).catch(() => []);
	await Promise.all(
		entries.map((name) => fsp.unlink(`${MY_FILES_DIR}/${name}`).catch(() => {})),
	);
}

test('handleMyFilesUpload: platný title/html → 200, soubor na disku, záznam v manifestu', async () => {
	await clearManifest();
	const res = fakeRes();

	await handleMyFilesUpload({ body: { title: 'Test report', html: '<p>ahoj</p>' } }, res);

	assert.equal(res.statusCode, 200);
	assert.match(res.body.filename, /^\d{4}-\d{2}-\d{2}-test-report\.html$/);
	assert.equal(res.body.url, `/my-files/${res.body.filename}`);

	const obsah = await fsp.readFile(`${MY_FILES_DIR}/${res.body.filename}`, 'utf8');
	assert.equal(obsah, '<p>ahoj</p>');

	const manifest = JSON.parse(await fsp.readFile(MY_FILES_MANIFEST_PATH, 'utf8'));
	assert.equal(manifest.length, 1);
	assert.equal(manifest[0].title, 'Test report');
});

test('handleMyFilesUpload: druhé volání se stejným title ve stejný den přepíše, ne duplikuje', async () => {
	await clearManifest();
	const res1 = fakeRes();
	await handleMyFilesUpload({ body: { title: 'Přehled X', html: '<p>verze 1</p>' } }, res1);

	const res2 = fakeRes();
	await handleMyFilesUpload({ body: { title: 'Přehled X', html: '<p>verze 2</p>' } }, res2);

	assert.equal(res1.body.filename, res2.body.filename);

	const obsah = await fsp.readFile(`${MY_FILES_DIR}/${res2.body.filename}`, 'utf8');
	assert.equal(obsah, '<p>verze 2</p>');

	const manifest = JSON.parse(await fsp.readFile(MY_FILES_MANIFEST_PATH, 'utf8'));
	assert.equal(manifest.length, 1);
});

test('handleMyFilesUpload: chybějící title → 400, nic se nezapíše', async () => {
	await clearManifest();
	const res = fakeRes();

	await handleMyFilesUpload({ body: { html: '<p>ahoj</p>' } }, res);

	assert.equal(res.statusCode, 400);
	assert.equal(res.body.error, 'missing_title');
	const entries = await fsp.readdir(MY_FILES_DIR).catch(() => []);
	assert.deepEqual(entries, []);
});

test('handleMyFilesUpload: chybějící html → 400', async () => {
	await clearManifest();
	const res = fakeRes();

	await handleMyFilesUpload({ body: { title: 'Test' } }, res);

	assert.equal(res.statusCode, 400);
	assert.equal(res.body.error, 'missing_html');
});

test('handleMyFilesUpload: title bez použitelných znaků (jen diakritika/interpunkce) → 400', async () => {
	await clearManifest();
	const res = fakeRes();

	await handleMyFilesUpload({ body: { title: '???', html: '<p>ahoj</p>' } }, res);

	assert.equal(res.statusCode, 400);
	assert.equal(res.body.error, 'invalid_title');
});

test('handleMyFilesList: prázdný manifest → 200, klidná věta, ne pád', async () => {
	await clearManifest();
	const res = fakeRes();

	await handleMyFilesList({}, res);

	assert.equal(res.statusCode, 200);
	assert.match(res.body, /Zatím nic\./);
});

test('handleMyFilesList: obsahuje odkaz z manifestu, HTML v title je escapované', async () => {
	await clearManifest();
	const uploadRes = fakeRes();
	await handleMyFilesUpload(
		{ body: { title: 'Report <script>', html: '<p>ahoj</p>' } },
		uploadRes,
	);

	const listRes = fakeRes();
	await handleMyFilesList({}, listRes);

	assert.equal(listRes.statusCode, 200);
	assert.match(listRes.body, new RegExp(`href="/my-files/${uploadRes.body.filename}"`));
	assert.match(listRes.body, /Report &lt;script&gt;/);
	assert.doesNotMatch(listRes.body, /<script>/);
});
