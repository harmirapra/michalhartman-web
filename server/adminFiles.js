// GET /admin/files — mapa klíč → otisk, kterou Mac skript porovná s tím, co
// má lokálně, a pošle jen to, co chybí nebo se liší.
//
// Čte se ze záznamů state/photos/*.json, NIKDY z výpisu originals/. Kdyby se
// četlo z originals/, fotka uložená ale nezpracovaná (pád serveru mezi
// uložením originálu a zápisem záznamu) by vypadala jako hotová a server by
// ji už nikdy nepožádal znovu — byla by navždy neviditelná.

import { readAllPhotoRecords } from './photoRecords.js';

async function handleAdminFiles(_req, res) {
	const records = await readAllPhotoRecords();
	const soubory = {};
	for (const record of records) {
		soubory[record.klic] = record.otisk;
	}
	res.status(200).json({ soubory });
}

export { handleAdminFiles };
