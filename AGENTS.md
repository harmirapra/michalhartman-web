# Průvodce projektem

## Co je tento projekt

Osobní web Michala Hartmana — replika `michalhartman.com` postavená v Astru.
Běží na Railway, produkce je `https://new.michalhartman.com`. Vzniká jako
cvičení CI/CD pipeline; původní web na WordPressu běží dál nezávisle.

**Před každým vizuálním výstupem si přečti `DESIGN.md` a řiď se jím.**

## Setup

```bash
npm ci                 # instalace závislostí
cp .env.example .env   # zatím prázdné, Etapa 1 žádné proměnné nepotřebuje
```

## Spuštění a testy

```bash
npm run dev           # vývojový server, http://localhost:4321
npm run build         # sestavení do dist/
npm start             # tenký server (server.js) nad hotovým dist/ — jako na produkci
npm run check:links   # kontrola, že žádný odkaz nevede do prázdna
```

`npm start` spouští `server.js` — vlastní tenký Express server, který servíruje
`dist/` (žádné SSR, Astro pořád generuje statiku při buildu). Poslouchá na
portu z proměnné `PORT` (výchozí `4321`), zapíná gzip/Brotli kompresi a na
neznámé cestě vrací 404. Architektura na něj později naváže vlastní cesty
(`/photos/*`, `/api/index.json`, `/admin/upload`, `/admin/rebuild`) — zatím
žádná z nich neexistuje.

## Deploy

Nasazuje se na Railway ze složky `dist/`.

- **Produkce:** merge pull requestu do `main` → automatické nasazení na `new.michalhartman.com`
- **Náhled:** každý otevřený pull request dostane vlastní dočasnou URL
- **Logy:** Railway dashboard → služba → Deployments (build log) a Logs (runtime log)
- **Cesta zpět:** viz sekce níže

## Environment variables

Etapa 1 žádné nepotřebuje. Zdroj pravdy pro seznam je `.env.example`.

## Co agent nesmí

- číst ani commitovat `.env` a jiné soubory s klíči,
- `git push --force` a jiné destruktivní kroky bez výslovného potvrzení,
- pushovat přímo do `main` — vždy přes branch a pull request,
- zasahovat do produkčního WordPressu na `michalhartman.com`.

## Dočasné odchylky od originálu (Etapa 1)

Replika záměrně vynechává odkazy na stránky, které v Etapě 1 neexistují.
Kdyby na ně vedl odkaz, kontrola odkazů by ho označila jako rozbitý.

| Co chybí | Kde to na originále je | Kdy se doplní |
|---|---|---|
| **Galerie** | v navigaci a jako druhý rozcestník na úvodní stránce | Etapa 2 |
| Ochrana osobních údajů | v patičce | zatím mimo rozsah |
| Nastavení cookies | v patičce | zatím mimo rozsah |
| Anglická verze `/en/` | přepínač jazyka v hlavičce | zatím mimo rozsah |

**Nepřidávej odkazy na tyto stránky, dokud nevzniknou.**

Adresy stránek jsou anglické (`/about/`, ne `/o-mne/`) — stejně jako na originále.

## Bezpečný postup změny

```
pull → branch → změna → diff → commit → push → pull request
     → zelená kontrola + náhled → merge → produkce
```

## Quality gate

Před mergem musí platit všechno:

- [ ] `npm run build` proběhne bez chyby,
- [ ] `npm run check:links` nenajde rozbitý odkaz,
- [ ] náhledová URL je otevřená a zkontrolovaná člověkem,
- [ ] u vizuálních změn: screenshot porovnaný s `DESIGN.md`.

## Když měníš setup, build nebo deploy

Aktualizuj tenhle soubor. Zastaralé instrukce jsou horší než žádné.
