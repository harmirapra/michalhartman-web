# „Dej mi to na web" — publikace do /my-files bez redeploye — implementační plán

> **Pro agenty:** Plán se vykonává úkol po úkolu, shora dolů. Kroky mají checkbox
> syntaxi (`- [x]`). Odškrtávej je průběžně přímo v tomto souboru.
>
> **Podklady (čti před začátkem):**
> - `AGENTS.md` — architektura `/admin/*`, trvalý disk (fáze 2+3), bezpečný postup změny, quality gate
> - `server/adminAuth.js` — vzor tokenové autentizace, který se znovupoužívá beze změny
> - `server/dataDir.js` — vzor persistentního adresáře na Railway volume
> - `server/slug.js` — vzor bezpečné slugifikace názvu (`slugifySegment`)
> - `scripts/publikovat-fotky` — vzor bash+curl publikačního skriptu (styl, ne přímé znovupoužití)
> - `src/pages/my-files/index.astro` a `public/my-files/2026-09-03-prehled-po-os.html` — dnešní ruční MVP, které tenhle plán nahrazuje

**Cíl:** Umožnit publikaci jednorázových/dočasných HTML reportů (výstupy z jiných
projektů, ke čtení „on the go") na `/my-files/*` na produkci **bez git commitu a
bez redeploye** — na pokyn „dej mi to na web" / „hoď mi to na web" z libovolné
PACT session.

**Rozhodnutí z brainstormingu (2026-09-07):**
- Zvolen Přístup B — perzistentní disk + admin API (viz zdůvodnění níže),
  ne rozšíření dnešního git-based MVP.
- Skill **jen publikuje** existující lokální HTML soubor. Skládání obsahu podle
  preferovaného vizuálního standardu je záměrně mimo rozsah — bude řešeno
  případně jako samostatná dovednost v budoucnu, nemíchat dvě schopnosti do
  jednoho skillu.
- Model soukromí zůstává beze změny: odkaz bez hesla (stejné jako dnešní MVP).
  Obsah není citlivý, jen není určený pro náhodné návštěvníky.
- Motivace pro „bez redeploye" **není odstávka** (Railway dělá zero-downtime
  rolling deploy i dnes) — je to (a) minuty čekání na build+merge pro
  jednorázovku a (b) že tyhle dočasné soubory nemají zůstávat navždy v git
  historii produkčního webu.

---

## Kontext: proč Přístup B

Server už dnes má přesně tenhle vzor pro fotky: Railway volume (`/data`),
token-chráněný `/admin/*` endpoint (`ADMIN_TOKEN`, viz `server/adminAuth.js`),
bezpečná slugifikace názvu (`server/slug.js`). Nový mechanismus tohle
znovupoužije — je to tedy malá, levá a bezpečná změna (existující, už
otestovaný autentizační a storage vzor), ne nový vzor k vymýšlení.

---

## Globální omezení

- **Dvě pracovní složky:**
  - `/Users/michalhartman/Projects/michalhartman-web` — server, testy, PR
  - PACT repo (kořen tohoto workspace) — nový skill v `1_Agents/skills/`
- **GitHub:** účet `harmirapra`, repo `michalhartman-web` — pull → branch →
  změna → diff → commit → push → PR → zelená kontrola + náhled → merge
  → produkce (`AGENTS.md`, „Bezpečný postup změny").
- Agent nesmí číst ani commitovat `.env`, nesmí pushovat přímo do `main`,
  nesmí force-pushovat bez výslovného potvrzení.
- Tenhle plán mění produkční server (`michalhartman-web`) — jde přes běžný
  PR + Michalovo review, ne přímý zásah.

---

## Úkol 1 — Datový adresář a manifest

`server/dataDir.js`:
- [x] Přidat `MY_FILES_DIR = path.join(DATA_DIR, 'my-files')`.
- [x] Přidat `MANIFEST_PATH` — **umístěno do `STATE_DIR`, ne do `MY_FILES_DIR`**
      (`server/dataDir.js` → `MY_FILES_MANIFEST_PATH`), aby nešel stáhnout jako
      `/my-files/manifest.json` (ta složka se servíruje veřejně staticky).
- [x] Přidat `MY_FILES_DIR` do `ALL_DIRS`, ať ho `ensureDataDirs()` založí na startu.
- [x] Exportovat obě nové konstanty.

Formát `manifest.json`: pole záznamů `{ slug, title, filename, publishedAt }`,
seřazené od nejnovějšího. Chybějící/poškozený soubor = prázdné pole (stejná
filosofie jako `mediaIndex.js` u fotek — samoopravitelné, nikdy nespadne server).

## Úkol 2 — `server/myFiles.js`

- [x] `slugifyTitle(title)` — znovupoužij `slugifySegment` ze `server/slug.js`
      (žádná nová slugifikační logika).
- [x] `handleMyFilesUpload(req, res)` (admin, chráněno `requireAdminToken`):
  - vstup: `POST /admin/my-files`, JSON tělo `{ title: string, html: string }`
  - validace: `title` neprázdný string, `html` neprázdný string, limit velikosti
    těla (návrh 2 MB — dostatečné pro statický report, `express.json({limit:'2mb'})`
    namontovaný **až uvnitř** téhle route, ne globálně — token se ověřuje dřív,
    než se čte tělo, stejná zásada jako u `handleUpload` pro fotky)
  - název souboru: `<YYYY-MM-DD>-<slug>.html` (datum = den publikace)
  - **stejný slug ve stejný den = přepis na místě** (přesně vzor, který už
    reálně nastal 3.9.–7.9. u po-os reportu — „Update … report"), ne duplicitní
    soubor
  - zápis HTML do `MY_FILES_DIR`, update `manifest.json` (upsert podle
    `slug`+datum, ne append duplicitně)
  - odpověď: `{ slug, filename, url: "/my-files/<filename>", publishedAt }`
- [x] `handleMyFilesList(req, res)` (veřejné, BEZ tokenu):
  - `GET /my-files/` — přečte manifest, vyrenderuje jednoduchou HTML stránku
    se seznamem odkazů (název, datum), styl podle dnešní `index.astro`
    (nadpis, `<ul>` odkazů, `target="_blank"`) — žádný nový vizuální jazyk
    k vymýšlení
  - prázdný manifest = klidná věta „Zatím nic", ne prázdná stránka bez vysvětlení

## Úkol 3 — zapojení do `server.js`

- [x] `adminRouter.post('/my-files', express.json({ limit: '2mb' }), handleMyFilesUpload)`
- [x] `app.get('/my-files/', handleMyFilesList)` — **před** finálním
      `express.static(distDir, …)` fallbackem, jinak by ho přebil starý build
- [x] `app.use('/my-files', express.static(MY_FILES_DIR, { setHeaders(res) { res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate'); } }))`
      — servíruje jednotlivé publikované soubory přímo z disku; umístit
      **před** finální `express.static(distDir, …)`, ale jako static
      middleware bez nálezu souboru sám zavolá `next()`, takže existující
      `dist/my-files/2026-09-03-prehled-po-os.html` (viz úkol 4) zůstane
      dostupný beze změny, dokud se nemigruje

## Úkol 4 — migrace existujícího MVP

- [ ] Po nasazení (úkol 6) jednou zavolat nový endpoint a přepublikovat
      `2026-09-03-prehled-po-os.html` přes něj (stejný obsah, nový mechanismus)
- [ ] Po ověření, že je dostupný přes nový `/my-files/` seznam, smazat
      `src/pages/my-files/index.astro` a `public/my-files/2026-09-03-prehled-po-os.html`
      — jeden zdroj pravdy (manifest na disku), ne dva paralelní mechanismy

## Úkol 5 — testy

`server/__tests__/myFiles.test.js`, po vzoru existujících testů
(`upload.test.js`-style, `adminReport.test.js`):
- [x] upload bez tokenu → 401
- [x] upload s tokenem, platný `title`/`html` → 200, soubor na disku existuje,
      manifest obsahuje záznam
- [x] druhý upload se stejným title/den → přepíše, manifest nemá duplicitu
- [x] upload s prázdným `title` nebo `html` → 400
- [x] `GET /my-files/` bez tokenu → 200, obsahuje odkazy z manifestu
- [x] `GET /my-files/` s prázdným manifestem → 200, klidná věta, ne pád

## Úkol 6 — quality gate a nasazení

Podle `AGENTS.md`:
- [x] `npm test` bez chyby (52/55 zelených, 3 selhání pre-existující/nesouvisející — chybí lokální fixture fotky)
- [x] `npm run build` bez chyby
- [x] `npm run check:links` nenajde rozbitý odkaz
- [x] náhledová URL (Railway PR preview) otevřená a ověřená — ručně zavolat
      nový endpoint (curl s testovacím tokenem) a zkontrolovat, že se soubor
      objeví na `/my-files/`
- [ ] PR [#47](https://github.com/harmirapra/michalhartman-web/pull/47) otevřený, CI+preview zelené — **čeká na Michalovo review a merge**

## Úkol 7 — PACT skill `1_Agents/skills/my-files-publish/`

`SKILL.md`:
- [x] Frontmatter `name: my-files-publish`, popis s trigger frázemi „dej mi to
      na web", „hoď mi to na web", „publikuj [soubor] na my-files"
- [x] Vstup: cesta k lokálnímu `.html` souboru + název (title)
- [x] Postup:
  1. Získat `ADMIN_TOKEN`: primárně `railway variables --json` (Railway CLI je
     na tomhle Macu autentizované, ověřeno 30.8. u `railway deployment list`)
     ve složce `/Users/michalhartman/Projects/michalhartman-web`; fallback
     na `ADMIN_TOKEN` z `.env` tam, pokud existuje. **Token se nikdy netiskne
     do výstupu ani logu, nikdy se neukládá do PACT repa.**
  2. `curl -sS -X POST https://<doména>/admin/my-files -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" --data-binary @<tmp.json>`
     — **implementace jde dál**: doména se zjišťuje dynamicky přes
     `railway variables --json` (`RAILWAY_PUBLIC_DOMAIN`), ne natvrdo
     `new.michalhartman.com` — ten mezitím (mezi plánem a implementací)
     přestal být produkční doménou, produkce je teď `michalhartman.com`.
     (tělo poskládané z title + obsahu souboru, bezpečně escapované —
     `jq -n --arg title "$T" --rawfile html "$SOUBOR" '{title:$title, html:$html}'`,
     ne ruční skládání JSON stringu)
  3. Z odpovědi přečíst `url`, vrátit uživateli plnou adresu
     (`https://<doména>` + `url`)
- [x] Skript `scripts/publish.sh` uvnitř skillu (samostatný, nezávislý na
      `michalhartman-web/scripts/`), čistě bash+curl+jq, žádné nové závislosti
- [x] Chybové stavy: chybí token (ani Railway CLI, ani `.env`) → jasná hláška,
      neselhat potichu; server nedostupný / 401 / 429 (rate-limit z
      `adminAuth.js`) → hláška, ne retry loop

## Úkol 8 — ověření end-to-end

- [x] Skillem publikovat testovací soubor ověřeno na **Railway PR preview**
      (`scripts/publish.sh` end-to-end, viz worklog) — **ověření na produkci
      čeká na merge PR #47**
- [x] Ověřit, že opakovaná publikace se stejným title přepíše, ne duplikuje
      (ověřeno testy i ručně)

---

## Co záměrně zůstává mimo rozsah (v1)

- Žádná expirace/úklid starých reportů (ruční mazání, pokud/až bude potřeba)
- Žádná autentizace na čtení (`GET /my-files/*`) — nezměněný model soukromí
- Žádné skládání obsahu podle vizuálního standardu — skill jen publikuje,
  netvoří obsah
