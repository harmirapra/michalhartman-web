// „Dej mi to na web" — publikace dočasných HTML reportů na /my-files/* bez
// commitu a bez redeploye.
//
// POST /admin/my-files (chráněno requireAdminToken) zapíše HTML na perzistentní
// disk a zapíše/aktualizuje záznam v manifest.json. GET /my-files/ (veřejné,
// bez tokenu — stejný model soukromí jako dosavadní git-based MVP: odkaz bez
// hesla, ne skutečná ochrana) vyrenderuje seznam z manifestu.
//
// Stejný slug + stejný den = přepis na místě, ne duplicitní soubor — přesně
// vzor, který nastal 3.–7. 9. 2026 u ručně publikovaného po-os reportu
// ("Update … report").

import fsp from 'node:fs/promises';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import { MY_FILES_DIR, MY_FILES_MANIFEST_PATH } from './dataDir.js';
import { slugifySegment } from './slug.js';

const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB — dost pro statický report, málo pro omyl/zneužití.

function todayDate() {
	return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function readManifest() {
	try {
		const raw = await fsp.readFile(MY_FILES_MANIFEST_PATH, 'utf8');
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		// Chybějící/poškozený manifest = prázdný seznam, ne pád — stejná
		// filosofie jako readIndexOrEmpty() v mediaIndex.js.
		return [];
	}
}

async function writeManifest(entries) {
	await writeFileAtomic(MY_FILES_MANIFEST_PATH, JSON.stringify(entries, null, 2));
}

function escapeHtml(text) {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

async function handleMyFilesUpload(req, res) {
	const { title, html } = req.body ?? {};

	if (typeof title !== 'string' || title.trim().length === 0) {
		res.status(400).json({ error: 'missing_title', message: 'Chybí "title".' });
		return;
	}
	if (typeof html !== 'string' || html.length === 0) {
		res.status(400).json({ error: 'missing_html', message: 'Chybí "html".' });
		return;
	}
	if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
		res.status(413).json({ error: 'payload_too_large' });
		return;
	}

	const slug = slugifySegment(title);
	if (slug.length === 0) {
		res
			.status(400)
			.json({ error: 'invalid_title', message: 'Title se nedá bezpečně převést na slug.' });
		return;
	}

	const date = todayDate();
	const filename = `${date}-${slug}.html`;
	const filePath = path.join(MY_FILES_DIR, filename);

	try {
		await writeFileAtomic(filePath, html, 'utf8');
	} catch (err) {
		console.error('Zápis my-files souboru selhal:', err);
		res.status(500).json({ error: 'write_failed' });
		return;
	}

	const publishedAt = new Date().toISOString();
	const manifest = await readManifest();
	const existingIndex = manifest.findIndex((entry) => entry.slug === slug && entry.date === date);
	const entry = { slug, date, title, filename, publishedAt };
	if (existingIndex === -1) {
		manifest.unshift(entry);
	} else {
		manifest[existingIndex] = entry;
	}
	// Nejnovější první — stejné pořadí, v jakém je má zobrazit GET /my-files/.
	manifest.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

	try {
		await writeManifest(manifest);
	} catch (err) {
		console.error('Zápis my-files manifestu selhal:', err);
		res.status(500).json({ error: 'manifest_write_failed' });
		return;
	}

	res.status(200).json({ slug, filename, url: `/my-files/${filename}`, publishedAt });
}

async function handleMyFilesList(_req, res) {
	const manifest = await readManifest();

	const items =
		manifest.length === 0
			? '<p>Zatím nic.</p>'
			: `<ul>\n${manifest
					.map(
						(entry) =>
							`\t\t<li><a href="/my-files/${escapeHtml(entry.filename)}" target="_blank" rel="noopener">${escapeHtml(entry.date)} — ${escapeHtml(entry.title)}</a></li>`,
					)
					.join('\n')}\n\t</ul>`;

	res
		.status(200)
		.type('html')
		.send(
			`<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>Soubory – Michal Hartman</title></head><body><main><h1>Soubory</h1><p>Odkazy níže otevírají soubor v novém okně.</p>\n\t${items}\n</main></body></html>`,
		);
}

export { handleMyFilesUpload, handleMyFilesList, MAX_HTML_BYTES };
