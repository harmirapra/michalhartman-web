// Ochrana /admin/*: token z ADMIN_TOKEN + počítadlo neúspěšných pokusů.
//
// Token se ověřuje jako úplně první věc pro každý požadavek na /admin/* —
// dřív, než cokoliv čte tělo požadavku. To je záměr, ne náhoda: bez toho by
// server od útočníka nejdřív stáhl celé tělo (třeba stovky megabajtů) a až
// pak ho odmítl, a ten přenos by se platil.
//
// Počítadlo neúspěšných pokusů žije jen v paměti procesu (Map). Restart
// kontejneru ho vynuluje — to je záměr. Nikdy ho neukládej na disk: soubor
// by přežil restart a mohl by přístup zablokovat natrvalo.

import crypto from 'node:crypto';

const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 60_000; // 1 minuta

const failuresByIp = new Map();

function getClientIp(req) {
	return req.ip || req.socket?.remoteAddress || 'unknown';
}

function isBlocked(ip) {
	const entry = failuresByIp.get(ip);
	if (!entry || !entry.blockedUntil) {
		return false;
	}
	if (entry.blockedUntil > Date.now()) {
		return true;
	}
	// Blok vypršel — smazat záznam, další pokus začíná od nuly.
	failuresByIp.delete(ip);
	return false;
}

function recordFailure(ip) {
	const entry = failuresByIp.get(ip) || { count: 0, blockedUntil: null };
	entry.count += 1;
	if (entry.count >= MAX_FAILED_ATTEMPTS) {
		entry.blockedUntil = Date.now() + BLOCK_DURATION_MS;
	}
	failuresByIp.set(ip, entry);
}

function recordSuccess(ip) {
	failuresByIp.delete(ip);
}

// Porovnání v konstantním čase, bezpečné i když mají řetězce jinou délku
// (v tom případě prostě vždy vrátí false, ale pořád provede porovnání
// stejné délky, aby čas odpovědi nevynesl délku tokenu).
function timingSafeEqualStrings(a, b) {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) {
		crypto.timingSafeEqual(bufA, bufA);
		return false;
	}
	return crypto.timingSafeEqual(bufA, bufB);
}

// Po dokončení odpovědi tvrdě zavře spojení — klient tak nemůže pokračovat
// v posílání těla požadavku (to je podstatné pro kontrolu č. 2 ze zadání).
function respondAndClose(req, res, status, body) {
	res.status(status).json(body);
	res.once('finish', () => {
		req.destroy();
	});
}

function requireAdminToken(req, res, next) {
	const configuredToken = process.env.ADMIN_TOKEN;
	if (!configuredToken) {
		respondAndClose(req, res, 503, {
			error: 'admin_disabled',
			message: 'ADMIN_TOKEN není v prostředí nastaven.',
		});
		return;
	}

	const ip = getClientIp(req);
	if (isBlocked(ip)) {
		respondAndClose(req, res, 429, { error: 'too_many_attempts' });
		return;
	}

	const header = req.get('authorization') || '';
	const [scheme, token] = header.split(' ');
	const providedToken = scheme === 'Bearer' && token ? token : null;

	if (!providedToken || !timingSafeEqualStrings(providedToken, configuredToken)) {
		recordFailure(ip);
		respondAndClose(req, res, 401, { error: 'unauthorized' });
		return;
	}

	recordSuccess(ip);
	next();
}

export { requireAdminToken, failuresByIp, MAX_FAILED_ATTEMPTS, BLOCK_DURATION_MS };
