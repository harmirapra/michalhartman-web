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
- **Ověření, že nasazení konkrétního commitu doběhlo:** `railway deployment list --json`
  vrací pole nasazení seřazené od nejnovějšího, každé se `status` a
  `meta.commitHash`. Rychlejší a spolehlivější než čekat na GitHub commit
  status API nebo opakovaně curlovat produkci — ten stav nemusí odpovídat
  poslednímu mergnutému commitu, dokud `status` nepřejde na `SUCCESS`.
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
- `POST /admin/forget?klic=<klíč>` — smaže fotku ze serveru natrvalo
  (originál, odvozené velikosti, záznam), pak přeskládá index. Fáze 7,
  detaily (validace proti existujícím záznamům, mazání osiřelých velikostí)
  viz sekce „Obrazovky správy (fáze 7)" níže.

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
nikdy `display: none`).

Sdílené typy a pomocné funkce nad indexem (`urlOdvozene`, `jeZobrazitelna`,
`odpovidaKlicovemuSlovu`, `nacistIndex`) jsou od fáze 6 v `src/lib/fotky.ts` —
používá je jak `MediaGalerie.astro`, tak rozcestník `/gallery/`, aby se
pravidlo shody klíčového slova a filtr zobrazitelnosti nerozjely do dvou kopií.

Ostatní layouty z architektury (`mrizka`, `zdivo`, `mozaika`, `karusel`) se
přidají, až je bude nějaká galerie potřebovat.

## Rozcestník galerií (fáze 6)

`/gallery/` (`src/pages/gallery.astro`), plus stránky `/greece/` a `/france/`
podle vzoru `/scotland/`. Odkaz „Galerie" v hlavičce a v drobečkové
navigaci je od téhle fáze funkční `<a>` na všech stránkách (dřív
`.odkaz-vzhled` span).

Dlaždice rozcestníku má tři části ze **tří různých zdrojů** — jádro
rozhodnutí fáze 6:

- **obrázek** — z metadat, klíčové slovo `MH-gallery-index-<slug>`
  (`slug` = `greece`/`scotland`/`france`). Kaskáda: 1) fotka s tímhle
  klíčovým slovem, 2) když žádná není, fotka s klíčovým slovem galerie
  (`Greece`/`Scotland`/`France`), 3) když ani ta ne, dlaždice bez obrázku
  (`.rozcestnik-dlazdice--bez-obrazku`, jen název na tmavé ploše, odkaz dál
  funguje). Víc kandidátů v jednom kroku → bere se první podle klíče
  (abecedně) — **stabilní výběr, ne náhodný** (na rozdíl od pořadí uvnitř
  stránky galerie, které se schválně míchá znovu při každém načtení).
- **popisek** (např. „Skotsko") — staticky ze stránky (`DLAZDICE` v
  `gallery.astro`), ne z Title fotky.
- **cíl odkazu** (např. `/scotland/`) — staticky ze stránky, ze stejného
  místa. Navigace nesmí stát na metadatech — omylem označená fotka smí
  rozbít nejvýš obrázek na dlaždici, nikdy odkaz.

Proto rozcestník **nepoužívá `<MediaGalerie>`** — ta natahuje všechny
odpovídající fotky a odkazuje na plnou velikost s lightboxem, přesný opak
toho, co dlaždice potřebuje (jedna fotka, statický odkaz na stránku
galerie, **klik naviguje, neotevírá lightbox**). Sdílí s ní ale mechanismus
zarovnané řady (`--polozka-pomer`, token `--rozcestnik-dlazdice-vyska` místo
`--galerie-radek-vyska`) a pomocné funkce z `src/lib/fotky.ts`.

Klíčové slovo `MH-gallery-index-*` zatím nemá žádná fotka — na produkci se
uplatní kaskáda (krok 2) pro Skotsko a Řecko. Francie nemá zatím žádnou
fotku vůbec, dlaždice je bez obrázku a `/france/` je prázdná galerie —
očekávaný stav, ne chyba.

## Obrazovky správy (fáze 7)

`/admin` — jediná obrazovka, na kterou se chodí, když něco nesedí (v devíti
případech z deseti hlavní rozhraní je výpis `scripts/publikovat-fotky`).
Diagnostika a záchrana, ne každodenní nástroj. Statická Astro stránka
(`src/pages/admin.astro`) bez `<Base>` (žádná hlavička/patička webu — je to
pracovní nástroj, ne prezentace), s vlastním klientským JS, které se přepíná
mezi třemi sekcemi (Stav knihovny / Klíčová slova / Najít fotku) — žádné
samostatné URL, žádný reload.

**Tvrdé pravidlo: token se nikde neukládá.** Ani `localStorage`, ani
`sessionStorage`, ani cookie — stránky `/cookies/` a `/privacy-policy/`
tvrdí, že web do zařízení návštěvníka neukládá nic, a to musí platit i tady.
Token žije jen v proměnné JS na stránce a posílá se v hlavičce
`Authorization: Bearer <token>` u každého volání; zavřením záložky/reloadem
mizí a musí se vložit znovu.

`/admin` **není v mapě webu ani v navigaci** (žádná stránka na něj
neodkazuje) a má `<meta name="robots" content="noindex, nofollow">`.

**Routing v `server.js`:** statický `dist/admin/` se servíruje BEZ tokenu,
zapojený PŘED admin routerem — jinak by `requireAdminToken` (mountovaný přes
`adminRouter.use(...)`) odmítl i načtení samotné stránky, dřív, než by šlo
token vůbec zadat. Volání jako `/admin/stav` nebo `/admin/report` tou
statickou vrstvou jen protečou (žádný soubor toho jména v `dist/admin/`
neexistuje) až k routeru s tokenem pod ní.

**`POST /admin/forget?klic=<klíč>`** — smaže fotku ze serveru natrvalo:
originál, všechny odvozené velikosti (i případné osiřelé, viz níže) a záznam
(úspěšný i neúspěšný), pak přeskládá index (`force: true` — úbytek je tu
vždy vědomý). Jádro je `forgetPhoto()` v `server/adminForget.js`, čistá
funkce testovatelná bez mockování Express req/res (stejný precedens jako
`rebuildIndex`).

- **Vstup se validuje proti seznamu existujících záznamů**
  (`readAllPhotoRecords()` + `readAllFailedRecords()` — hledá se v obou,
  aby šla smazat i fotka, jejíž zpracování selhalo). Cesta na disku se
  NIKDY neskládá zřetězením s tím, co pošle klient — teprve po nalezení
  klíče mezi existujícími záznamy se pracuje s klíčem z toho nalezeného
  záznamu (stejný přístup jako `POST /admin/upload`, viz `upload.js`).
- Neplatný tvar klíče (např. `../`) → 400 dřív, než se cokoliv čte ze
  záznamů. Neexistující (ale tvarem platný) klíč → 404.
- Odvozené velikosti se mažou podle skutečného obsahu `derived/`, ne jen
  podle toho, co „ví" záznam (`record.odvozene`) — u fotky s přerušeným
  zpracováním mohla podle poznámky v `deriveImages.js` („nikdy sama
  neuklízí") vzniknout osiřelá velikost bez záznamu. Bezpečné: klíč nikdy
  neobsahuje `_` (viz `slug.js`), takže prefix `<klíč>_` nemůže zasáhnout
  jiný, podobně pojmenovaný klíč.

**Obrazovka „Najít fotku"** hledá jen v klíči (ne v obrázcích — rozhraní
není prohlížeč fotek). Zdroj dat je kombinace `GET /api/index.json`
(veřejné, úspěšně zpracované fotky — nese `klicovaSlova`/`odvozene`) a
`selhaneFotky` z `GET /admin/report` (fotky, které nikdy nedostaly úspěšný
záznam, takže v indexu nejsou) — jinak by se přes tuhle obrazovku nedala
najít a smazat fotka, jejíž zpracování selhalo. „V jakých galeriích" počítá
stejnou funkcí shody (`odpovidaKlicovemuSlovu` z `src/lib/fotky.ts`) jako
skutečné stránky galerií, aby se admin obrazovka nikdy neodchýlila od toho,
co se opravdu zobrazí.

**Obrazovka „Klíčová slova"** zvýrazňuje **počet 1, ne „chyba"** — slovo na
jediné fotce může být v pořádku, obrazovka netvrdí jistotu, kterou nemá.
Klíčová slova s prefixem `MH-` (funkční značky, např.
`MH-gallery-index-scotland`) se počítají v samostatné tabulce, aby mezi
podezřelými nepřekážela.

**Prázdná sekce na Obrazovce „Stav knihovny" se ukazuje taky**, jako klidná
věta („Žádné — každá fotka má vlastní klíč.") — kdyby zmizela, nešlo by
poznat rozdíl mezi „zkontrolováno a v pořádku" a „nezkontrolováno".
`selhalo`/`kolize klíčů` se zvýrazňují jako chyba (`--barva-zvyrazneni`),
`bez klíčových slov`/`duplicitní obsah` jako upozornění
(`--barva-akcent-tlumeny`) — vědomá výjimka z DESIGN.md sekce 3 („nikdy dva
akcenty na jedné obrazovce"), nutná k tomu, aby diagnostická obrazovka vůbec
uměla ukázat rozdíl mezi „jistá chyba" a „jen se podívej". Oba tóny jsou
existující tokeny, žádný nový hex kód.

**Dynamický obsah (`innerHTML` v `<script>`) a scoped styly se nepotkávají**
— Astro přidává scopovací atribut (`data-astro-cid-*`) jen prvkům
přítomným v šabloně při buildu, ne prvkům vzniklým za běhu. Proto má
`admin.astro` `<style is:global>`, ne scoped `<style>` — všechny třídy mají
předponu `admin-`, riziko kolize s `global.css` je nulové.

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
| **Galerie jako druhý rozcestník** | na úvodní stránce (odkaz v navigaci a v drobečkách je od fáze 6 funkční) | zatím mimo rozsah |
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
