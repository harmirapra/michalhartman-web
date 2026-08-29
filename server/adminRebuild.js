// POST /admin/rebuild — poslepí index.json ze záznamů. Nic nezpracovává
// (žádná "opravná role") — viz mediaIndex.js pro mechaniku a pojistku proti
// tichému zmenšení pod ~80 % (bod D1 v návrhu).
//
// `?force=true` obchází pojistku proti zmenšení — vědomé vynucení, ne
// výchozí chování. Záměrně jen query parametr, ne JSON tělo: `/admin/upload`
// visí na stejném routeru a potřebuje syrové tělo požadavku (streamuje se
// rovnou do souboru) — parser JSON těla na úrovni routeru by ho rozbil.
import { rebuildIndex } from './mediaIndex.js';

function wantsForce(req) {
	return req.query.force === 'true' || req.query.force === '1';
}

async function handleAdminRebuild(req, res) {
	try {
		const vysledek = await rebuildIndex({ force: wantsForce(req) });
		res.status(200).json({
			zapsano: true,
			puvodniPocet: vysledek.puvodniPocet,
			novyPocet: vysledek.novyPocet,
			aktualizovano: vysledek.aktualizovano,
		});
	} catch (err) {
		if (err.code === 'INDEX_BY_SE_ZMENSIL') {
			res.status(409).json({
				zapsano: false,
				error: 'index_by_se_zmensil',
				message: err.message,
				puvodniPocet: err.puvodniPocet,
				novyPocet: err.novyPocet,
			});
			return;
		}
		console.error('Rebuild indexu selhal:', err);
		res.status(500).json({ zapsano: false, error: 'rebuild_failed' });
	}
}

export { handleAdminRebuild };
