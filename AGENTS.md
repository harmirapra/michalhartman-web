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
npm test              # testy serverového kódu (node:test), viz server/__tests__/
```

`npm start` spouští `server.js` — vlastní tenký Express server, který servíruje
`dist/` (žádné SSR, Astro pořád generuje statiku při buildu). Poslouchá na
portu z proměnné `PORT` (výchozí `4321`), zapíná gzip/Brotli kompresi a na
neznámé cestě vrací 404.

Od fáze 2 server navíc obsluhuje `/admin/*` (kód v `server/`) — trvalý disk
a příjem fotek. Fáze 3 přidává zpracování fotek (metadata + náhledy),
servírovaný index a `/photos/*` — viz sekce níže.

`npm test` běží nad dočasným `DATA_DIR` (skript si ho sám vytvoří přes
`mktemp -d`, nikdy nesahá na `/data`) a zamyšlené soubory z
`~/Pictures/MH-web/GalleryMedia` používá jen ke čtení — pokud tahle sada na
stroji chybí, testy, které na ní stojí, se přeskočí, ne spadnou.

## Deploy

Nasazuje se na Railway ze složky `dist/`.

- **Produkce:** merge pull requestu do `main` → automatické nasazení na `new.michalhartman.com`
- **Náhled:** každý otevřený pull request dostane vlastní dočasnou URL
- **Logy:** Railway dashboard → služba → Deployments (build log) a Logs (runtime log)
- **Cesta zpět:** viz sekce níže

## Environment variables

Etapa 1 žádné nepotřebuje. Zdroj pravdy pro seznam je `.env.example`.

Etapa 2 přidává:

- `DATA_DIR` — cesta k datovému adresáři, výchozí `/data`. V Railway je tam
  připojený trvalý disk (volume). Lokálně a v náhledu PR disk připojený být
  nemusí — server si strukturu vytvoří na dočasném souborovém systému.
- `ADMIN_TOKEN` — token pro `/admin/*` (hlavička `Authorization: Bearer
  <token>`). Chybí-li, `/admin/*` je celé nedostupné (503). Nikdy nepatří
  do repa.

## `/admin/*` (fáze 2 + 3)

Chráněné endpointy, token se ověřuje dřív, než server přečte tělo
požadavku (viz `server/adminAuth.js`). Neúspěšné pokusy o autorizaci se
počítají podle IP jen v paměti procesu — po pár pokusech přijde 429, restart
serveru počítadlo vynuluje.

- `POST /admin/upload?path=<relativní cesta k fotce>` — tělo požadavku jsou
  syrová data fotky. Cesta se slugifikací převede na klíč (`server/slug.js`),
  klíč se ještě zvlášť ověří proti povolenému tvaru (`a-z0-9-`) — cesta na
  disku se nikdy neskládá zřetězením s tím, co pošle klient. Uloží fotku do
  `$DATA_DIR/originals/<klíč>.jpg` přes dočasný soubor s náhodnou příponou
  a přejmenování a **hned po uložení ji zpracuje** (`server/photoProcessing.js`):
  přečte XMP metadata (`server/metadata.js`), vygeneruje tři odvozené
  velikosti WebP (`server/deriveImages.js`) a zapíše záznam
  `state/photos/<klíč>.json` jako úplně poslední krok. Selhání zpracování
  (typicky poškozený/useknutý soubor) NENÍ selhání uploadu — originál je
  uložený v pořádku, jen se nezpracoval; jde do `state/failed/<klíč>.json`
  s otiskem, aby se stejný obsah nezkoušel zpracovat pořád dokola. Odpověď
  nese `zpracovano: boolean` a při neúspěchu `chyba`.
- `GET /admin/stav` — diagnostika úložiště: jde zapisovat, kolik je tam
  originálů, kolik zbývá místa.
- `GET /admin/files` — mapa klíč → otisk **ze záznamů**
  `state/photos/*.json`, nikdy z výpisu `originals/` — jinak by fotka
  uložená, ale nezpracovaná, byla navždy neviditelná pro skript, který
  porovnává, co ještě chybí poslat.
- `POST /admin/rebuild[?force=true]` — poslepí `index.json` ze záznamů
  (`server/mediaIndex.js`), zápis přes `write-file-atomic`. Nic
  nezpracovává — žádná „opravná role“. Pojistka: je-li nový index pod ~80 %
  počtu fotek v současném indexu, výměna se odmítne (409), dá se vynutit
  `?force=true`.
- `GET /admin/report` — kontrolní výpis: souhrn (uloženo/v indexu/selhalo/bez
  klíčových slov), klíčová slova podle počtu od nejvzácnějších, fotky bez
  klíčových slov, selhané fotky, kolize klíčů, duplicitní obsah (`server/adminReport.js`).

Poškozený/chybějící `index.json` se přebuduje sám při startu serveru
(`ensureIndexHealthy()` v `server.js`).

`GET /api/index.json` (mimo `/admin/*`, bez tokenu) vrací index s hlavičkou
`Cache-Control: no-cache` — mění se při rebuildu, nesmí se cachovat na edge.

`/photos/*` servíruje `$DATA_DIR/derived/` s roční `immutable` cache — název
souboru nese otisk obsahu, takže je to bezpečné. `originals/` server ven
nikdy neexpozuje.

Detaily mechaniky (pořadí kroků při zpracování, proč `sharp` zůstává na
výchozím `failOn: 'warning'`, normalizace klíčových slov z `exifr`) jsou
v `0_Projects/web-michalhartman/plans/2026-08-29-faze-3-zpracovani-a-index.md`
v repu PACT.

## Publikace fotek (fáze 4)

`scripts/publikovat-fotky` — publikační skript pro Mac. Celý úkon publikace
je: Publish v Lightroomu, spustit tenhle skript.

```
./scripts/publikovat-fotky [--intake CESTA] [--server ADRESA]
```

Projde intake složku rekurzivně (jen `.jpg`/`.jpeg`), spočítá otisk
(`shasum -a 256`) každé fotky, zeptá se `GET /admin/files`, co server už má,
pošle rozdíl po jedné (`POST /admin/upload`), zavolá `POST /admin/rebuild`
(jen když bylo co poslat) a vypíše souhrn z `GET /admin/report`.

- **Čistý bash + curl**, žádný Node, žádný Python — spouští se párkrát
  ročně a musí přežít aktualizaci macOS. Cíleně kompatibilní s výchozím
  systémovým `/bin/bash` (macOS drží verzi 3.2 kvůli licenci) — žádná
  asociativní pole ani jiné bashismy 4+.
- **Nedrží žádný stav.** Zdrojem pravdy je vždy server — funguje z
  jakéhokoliv počítače a přerušený běh naváže sám při dalším spuštění.
- **Aditivní přenos** — nikdy nic nemaže podle toho, co v intake složce
  chybí.
- Slugifikace cesty na klíč (funkce `path_to_key` ve skriptu) musí přesně
  sedět s `server/slug.js` — jinak skript nepozná, že server fotku už má,
  a bude ji posílat pořád dokola. Ověřeno na všech 169 reálných souborech
  v `~/Pictures/MH-web/GalleryMedia` proti `pathToKey()` ze serveru
  (shoda 100 %, včetně souboru s mezerou v názvu a souborů v podsložkách).
- Výchozí intake složka: `~/Pictures/MH-web/GalleryMedia` (jen ke čtení —
  skript do ní nikdy nezapisuje). Výchozí server: produkce
  (`https://new.michalhartman.com`). Obojí jde přepsat parametrem nebo
  proměnnou prostředí `PUBLIKOVAT_FOTKY_INTAKE` / `PUBLIKOVAT_FOTKY_SERVER`.
- Token se čte z klíčenky (`security find-generic-password -s
  michalhartman-web-admin -w`), skript ho nikdy nevypisuje. Chybějící
  token skončí jasnou hláškou, ne pádem.
- Skončí nenulovým návratovým kódem, kdykoliv `/admin/report` hlásí
  `selhalo > 0`, nebo když v tomhle běhu selhal upload/rebuild — i když
  jednotlivá selhaná fotka běh sama o sobě nezastaví.

## Galerie (fáze 5)

Komponenta `src/components/MediaGalerie.astro` — parametry `klicoveSlovo`
a `layout` (zatím jen `"radky"`). **Nevykresluje se při buildu.** Astro
vygeneruje jen prázdný kontejner s parametry v `data-*` atributech;
klientský skript v komponentě si po načtení stránky vyzvedne
`GET /api/index.json`, vyfiltruje fotky podle klíčového slova (přesná shoda,
bez ohledu na velikost písmen) a poskládá mřížku. Nová fotka se tak objeví
v galerii hned po `POST /admin/rebuild`, bez nového buildu/deploye.

- **Pořadí je náhodné**, losuje se znovu při každém načtení stránky.
- **Prázdná galerie je legitimní stav** (nová galerie bez nahraných fotek) —
  žádná hláška, žádná chyba v konzoli, jen prázdné místo.
- **Layout „radky"** — jeden flex kontejner s `flex-wrap`, `gap: 5px`, každá
  fotka má `height` z tokenu `--galerie-radek-vyska` a `flex-grow` úměrný
  poměru stran (nastavuje JS přes vlastní proměnnou `--polozka-pomer`).
  Prohlížeč sám rozlomí fotky do řádků a v rámci každého řádku flex-grow
  dorovná šířku na 100 % — žádný layout balíček. Na mobilu (≤767 px) jeden
  sloupec, fotky na plnou šířku.
- **Lightbox: PhotoSwipe v5** (`photoswipe`, přišpendlená verze), napojení
  přes `photoswipe/lightbox` a `data-pswp-width`/`data-pswp-height` na
  odkazu kolem náhledu. Počítadlo a šipky zapnuté (výchozí chování),
  stažení vypnuté (jádro PhotoSwipe v5 žádné tlačítko stažení nemá, nic se
  sem nepřidává). Pozadí čistě černé (`--pswp-bg` přepsané na token
  `--barva-pozadi`, `bgOpacity: 1`) — žádný knihovní výchozí styl.
- **`ImageObject` (schema.org)** — mikrodata (`itemscope`/`itemtype` na
  odkazu, `<meta itemprop>` uvnitř) u každé fotky, z dat, která index nese
  stejně (`contentUrl`, `creator`, `copyrightNotice`, `license`, `caption`).
- **`width`/`height` na každém `<img>` povinně** (z `rozmery` v indexu) —
  bez nich stránka při načítání poskakuje.
- Alt text: kaskáda `titulek` fotky → název galerie (z `<h1>` stránky).
  Nikdy prázdný.

Stránka `/scotland/` (`src/pages/scotland.astro`) je první, co komponentu
používá — `klicoveSlovo="Scotland"`. `<h1>` je v HTML kvůli SEO
a odečítačům, ale vizuálně skrytý třídou `.vizualne-skryty` (`clip-path`,
nikdy `display: none`). Odkaz „Galerie" v drobečkové navigaci je zatím
`.odkaz-vzhled` span, ne `<a>` — rozcestník `/gallery/` vzniká až ve fázi 6.

Rozcestník `/gallery/` a další galerie (`/greece/`, `/france/`) jsou fáze 6.
Ostatní layouty z architektury (`mrizka`, `zdivo`, `mozaika`, `karusel`) se
přidají, až je bude nějaká galerie potřebovat.

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

- [ ] `npm test` proběhne bez chyby,
- [ ] `npm run build` proběhne bez chyby,
- [ ] `npm run check:links` nenajde rozbitý odkaz,
- [ ] náhledová URL je otevřená a zkontrolovaná člověkem,
- [ ] u vizuálních změn: screenshot porovnaný s `DESIGN.md`.

## Když měníš setup, build nebo deploy

Aktualizuj tenhle soubor. Zastaralé instrukce jsou horší než žádné.
