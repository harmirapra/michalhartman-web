// Zarovnané řádky (klasický „justified rows" layout) — sdílené mezi
// MediaGalerie.astro (mřížka fotek) a gallery.astro (dlaždice rozcestníku),
// viz jejich komentáře pro kontext. Nahrazuje dřívější trik s flex-grow
// (--polozka-pomer), který dopočítával ŠÍŘKU fotky při pevné výšce řádku —
// to fotky do šířky roztahovalo a object-fit: cover je ořezával (změřeno až
// 34 % ořezu, nejnápadnější na portrait fotce v rozcestníku).
//
// Správně je to naopak: výška řádku pevná NENÍ, dopočítá se tak, aby se do
// kontejneru vešly šířky beze zbytku — fotky se tím jen zmenšují, nikdy
// nezvětšují, a poměr stran zůstává přesný.

export interface PolozkaSPomerem {
	prvek: HTMLElement;
	/** šířka / výška fotky (nebo 1 pro dlaždici bez fotky — čtverec). */
	pomer: number;
}

interface VypocitanaPolozka {
	prvek: HTMLElement;
	sirka: number;
}

interface VypocitanyRadek {
	polozky: VypocitanaPolozka[];
	vyska: number;
}

/**
 * Čistá výpočetní funkce bez DOM: skládá položky do řádku a sčítá jejich
 * poměry stran; jakmile by řádek při cílové výšce přesáhl šířku kontejneru,
 * uzavře ho a dopočítá skutečnou (jen menší, nikdy větší) výšku tak, aby se
 * šířky vešly přesně — `vyska = (sirkaKontejneru - mezery) / soucetPomeru`.
 * Poslední neúplný řádek zůstává na cílové výšce a nenatahuje se přes celou
 * šířku (jinak by pár fotek na řádku vyrostlo do absurdní velikosti).
 */
export function spocitejRadky(
	polozky: PolozkaSPomerem[],
	sirkaKontejneru: number,
	cilovaVyska: number,
	mezera: number,
): VypocitanyRadek[] {
	const radky: VypocitanyRadek[] = [];
	let aktualni: PolozkaSPomerem[] = [];
	let soucetPomeru = 0;

	for (const polozka of polozky) {
		aktualni.push(polozka);
		soucetPomeru += polozka.pomer;

		const mezeryRadku = mezera * (aktualni.length - 1);
		const sirkaPriCiloveVysce = cilovaVyska * soucetPomeru + mezeryRadku;

		if (sirkaPriCiloveVysce >= sirkaKontejneru) {
			const vyska = (sirkaKontejneru - mezeryRadku) / soucetPomeru;
			radky.push({
				vyska,
				polozky: aktualni.map((p) => ({ prvek: p.prvek, sirka: vyska * p.pomer })),
			});
			aktualni = [];
			soucetPomeru = 0;
		}
	}

	if (aktualni.length > 0) {
		radky.push({
			vyska: cilovaVyska,
			polozky: aktualni.map((p) => ({ prvek: p.prvek, sirka: cilovaVyska * p.pomer })),
		});
	}

	return radky;
}

/**
 * Rozmístí `polozky` do `kontejner`u jako zarovnané řádky (desktop), nebo je
 * nechá jako plochý seznam (mobil, ≤767px — tam layout řeší čistě CSS,
 * jeden sloupec na plnou šířku, výška auto, beze změny). Cílová výška řádku
 * i mezera se čtou z CSS proměnných na kontejneru (jejich jména dostane
 * volající), aby se skutečné hodnoty měnily jen v global.css.
 *
 * Přeskládává existující prvky (nevytváří nové ani nemění jejich obsah),
 * takže opakované volání — např. po resize — nic znovu nenačítá.
 */
export function usporadejDoRadku(
	kontejner: HTMLElement,
	polozky: PolozkaSPomerem[],
	cilovaVyskaProp: string,
	mezeraProp: string,
	radekClass: string,
): void {
	kontejner.innerHTML = "";
	if (polozky.length === 0) return;

	if (window.matchMedia("(max-width: 767px)").matches) {
		polozky.forEach(({ prvek }) => {
			prvek.style.width = "";
			prvek.style.height = "";
			kontejner.appendChild(prvek);
		});
		return;
	}

	const styl = getComputedStyle(kontejner);
	const mezera = parseFloat(styl.getPropertyValue(mezeraProp)) || 0;
	const cilovaVyska = parseFloat(styl.getPropertyValue(cilovaVyskaProp)) || 0;
	const sirkaKontejneru =
		kontejner.clientWidth - (parseFloat(styl.paddingLeft) || 0) - (parseFloat(styl.paddingRight) || 0);

	for (const radek of spocitejRadky(polozky, sirkaKontejneru, cilovaVyska, mezera)) {
		const radekEl = document.createElement("div");
		radekEl.className = radekClass;
		radekEl.style.height = `${radek.vyska}px`;
		radek.polozky.forEach(({ prvek, sirka }) => {
			prvek.style.width = `${sirka}px`;
			prvek.style.height = "";
			radekEl.appendChild(prvek);
		});
		kontejner.appendChild(radekEl);
	}
}

/**
 * Zaregistruje posluchač resize, který (s malým zpožděním, aby se
 * nepřepočítávalo při každém pixelu tažení okna, jen po jeho ustálení)
 * znovu zavolá `prekresli` — layout se musí přepočítat, protože se resizem
 * mění složení řádků.
 */
export function priZmeneSirky(prekresli: () => void, zpozdeniMs = 150): void {
	let cas: number | undefined;
	window.addEventListener("resize", () => {
		window.clearTimeout(cas);
		cas = window.setTimeout(prekresli, zpozdeniMs);
	});
}
