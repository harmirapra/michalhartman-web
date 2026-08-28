// GET /admin/stav — diagnostika úložiště (ne obsahu knihovny, to je
// /admin/report z fáze 3). Ověřuje, že disk funguje: jde na něj zapisovat,
// kolik je tam originálů a kolik zbývá místa.

import { getStorageStatus } from './dataDir.js';

async function handleStav(_req, res) {
	const status = await getStorageStatus();
	res.status(200).json({
		zapisovatelny: status.writable,
		pocetOriginalu: status.originalsCount,
		volneMistoBajty: status.freeBytes,
	});
}

export { handleStav };
