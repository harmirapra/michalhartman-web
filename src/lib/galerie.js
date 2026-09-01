// Jeden zdroj pravdy pro seznam galerií (slug ↔ klíčové slovo ↔ název ↔
// cesta) — konzumuje ho jak server (server/ogFoto.js, server.js — zapojení
// routy pro OG meta tagy), tak stránka /gallery/ (dřív měla vlastní lokální
// konstantu DLAZDICE). Sdílené místo je nutné, aby se galerie nikdy
// nerozešly mezi tím, co server zná, a tím, co vykresluje Astro.
//
// Pořadí podle wireframu (Main.dc.html): Řecko, Skotsko, Francie.

export const GALERIE = [
	{ slug: "greece", nazev: "Řecko", klicGalerie: "Greece", cesta: "/greece/" },
	{ slug: "scotland", nazev: "Skotsko", klicGalerie: "Scotland", cesta: "/scotland/" },
	{ slug: "france", nazev: "Francie", klicGalerie: "France", cesta: "/france/" },
];

export function najdiGaleriiPodleSlugu(slug) {
	return GALERIE.find((g) => g.slug === slug) ?? null;
}
