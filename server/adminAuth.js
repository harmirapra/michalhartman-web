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
//
// Každý záznam má platnost. Bez ní by Map rostla donekonečna: IP, která
// selže jednou nebo dvakrát a nikdy se nevrátí, by v paměti zůstala napořád,
// a na /admin chodí skenery. Server běží měsíce, takže neomezeně rostoucí
// struktura je skutečný problém, ne teoretický.
//
// Vedlejší efekt platnosti je správnější chování: počítadlo je klouzavé okno,
// ne celoživotní součet. Čtyři neúspěchy rozházené po dnech nikoho neblokují.

import crypto from 'node:crypto';
import { getStorageError } from './dataDir.js';

const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 60_000; // 1 minuta

const failuresByIp = new Map();

// Kdyby Map přesto narostla (hodně různých IP v krátkém čase), projde se celá
// a vyhodí prošlé záznamy. Sweep je líný — spustí se až při zápisu, ne časovačem.
const SWEEP_THRESHOLD = 1000;

function sweepExpired(now) {
	for (const [ip, entry] of failuresByIp) {
		if (entry.expiresAt <= now) {
			failuresByIp.delete(ip);
		}
	}
}

function getClientIp(req) {
	return req.ip || req.socket?.remoteAddress || 'unknown';
}

function isBlocked(ip) {
	const entry = failuresByIp.get(ip);
	if (!entry) {
		return false;
	}
	const now = Date.now();
	// Prošlý záznam se zahazuje bez ohledu na to, jestli šlo o blok nebo jen
	// o pár neúspěchů — další pokus začíná od nuly.
	if (entry.expiresAt <= now) {
		failuresByIp.delete(ip);
		return false;
	}
	return Boolean(entry.blockedUntil && entry.blockedUntil > now);
}

function recordFailure(ip) {
	const now = Date.now();
	if (failuresByIp.size >= SWEEP_THRESHOLD) {
		sweepExpired(now);
	}
	const entry = failuresByIp.get(ip) || { count: 0, blockedUntil: null };
	entry.count += 1;
	if (entry.count >= MAX_FAILED_ATTEMPTS) {
		entry.blockedUntil = now + BLOCK_DURATION_MS;
	}
	// Každý neúspěch posouvá platnost — záznam přežije jen okno od posledního pokusu.
	entry.expiresAt = now + BLOCK_DURATION_MS;
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

	// Bez použitelného úložiště nemá /admin/* co dělat — ale web běží dál.
	const storageError = getStorageError();
	if (storageError) {
		respondAndClose(req, res, 503, { error: 'storage_unavailable', message: storageError });
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
