# DESIGN.md — michalhartman.com

Pravidla vizuálního jazyka webu. **Přečti si tenhle soubor před každým vizuálním
výstupem a řiď se jím.** Hodnoty jsou měřené na živém webu, ne odhadnuté.

---

## 1. Brief

Osobní portfolio Michala Hartmana — fotografa, jachtaře a poutníka. Tři stránky:
Úvod, Galerie, O mně (plus Impressum a právní stránky v patičce).

**Web je záměrně neprodejní.** Nemá e-shop, nemá poptávkový formulář, nemá výzvy
k akci mimo navigaci. Prodej fotografií běží mimo tento web. Cílem je nulová
administrativní zátěž.

**Co si má návštěvník odnést:** že se dívá na tvorbu člověka, který ví, co dělá,
a nepotřebuje to zdůrazňovat. Web nemá přesvědčovat — má ustoupit fotografiím.

## 2. Vizuální charakter (rozhodnutí, ne přání)

- **Černá plocha, bílá typografie, jedna fotografie.** Nic dalšího na úvodní
  stránce není a nemá být.
- **Fotografie nese sdělení, typografie ji obsluhuje.** Když se rozhoduje mezi
  „přidat prvek" a „ubrat prvek", ubírá se.
- **Jeden font v celém webu.** Hierarchie vzniká velikostí a tloušťkou, ne střídáním
  rodin.
- **Bez dekorace.** Žádné rámečky, stíny, gradienty, ikonky u nadpisů, animované
  přechody. Prázdné místo je záměr, ne nedodělek.

Formulace ze zamčeného design systému, která to shrnuje: *„Zen-inspired
minimalismus, precizní typografie, eliminace balastu."*

## 3. Tokeny — barvy

Měřeno v Elementor CSS živého webu (`post-216.css`, `post-1171.css`), 4. 8. 2026.

| Token | Hodnota | Role | Nikdy |
|---|---|---|---|
| `--barva-pozadi` | `#000000` | pozadí všech stránek | nepoužívat jako barvu textu |
| `--barva-textu` | `#FFFFFF` | běžný text, nadpisy, navigace | nepoužívat jako pozadí plochy |
| `--barva-zvyrazneni` | `#C02323` | jediný sytý akcent — stav odkazu při najetí | nikdy pro plochy, nikdy pro běžný text |
| `--barva-akcent-tlumeny` | `#AF4B2F` | tlumená varianta zvýraznění, jemné oddělovače | nepoužívat současně s `#C02323` na jedné obrazovce |
| `--barva-text-tlumeny` | `#E6E6E6` | popisky fotografií, drobný text v patičce | nepoužívat pro nadpisy |

**Pravidlo vzácnosti akcentu:** červená smí zabírat řádově jednotky procent plochy.
Když je jí na obrazovce vidět víc než pár slov, je to chyba.

**Žádné lokální přepisy barev.** Barva se mění jedině změnou tokenu tady, nikdy
zápisem hex kódu přímo v komponentě.

## 4. Typografie

**Jediná rodina: Poppins.** Nadpisy jsou záměrně velmi světlé (tloušťka 200),
text světlý (300). Odtud pochází vzdušný, nehutný dojem celého webu — je to
nejvýraznější rys typografie a nesmí se ztratit.

Záložní řetěz: `Poppins, system-ui, -apple-system, sans-serif`.

| Styl | Tloušťka | Velikost (desktop / ≤1024) | Řádkování | Prostrkání | Kdy použít |
|---|---|---|---|---|---|
| Nadpis | **200** | 35 / 25 px | 1.2 | 0 | `h1`, `h2` — název stránky, sekce |
| Text | **300** | 16 / 14 px | 1.5 | **+1.2 px** | odstavce |
| Navigace | 300 | 16 / 14 px | 1.5 | 0 | menu, odkazy v patičce |

**Prostrkání textu je kladné (+1.2 px), ne nulové.** Spolu se světlým řezem drží
odstavce vzdušné. Nezapomínat na něj — bez něj text zhoustne, i když je font správný.

**Mobilní velikosti (≤767 px) zbývá ověřit vizuálně** při screenshot review
(úkol 10). V CSS je u nadpisu plynulá hodnota `6.5vw` a u dalších prvků `20px`,
ale bez pohledu na stránku nejde spolehlivě přiřadit, co je co.

**Rozhodovací logika:**

- Nadpis se používá **jednou na stránku** jako `h1`. Další v pořadí jsou `h2`.
- Web vystačí se **dvěma stupni** — nadpis a text. Nevymýšlej mezistupně.
- **Nikdy verzálky u nadpisů.** Navigace a drobné popisky smí mít `capitalize`,
  nadpisy ne.
- **Nikdy nepodtrhávej nadpisy.**
- **Nikdy nezvyšuj tloušťku nadpisu, aby „lépe vynikl".** Světlý řez je záměr.
- Odstavce nechávej na levý praporek. Zarovnání do bloku vytváří v češtině řeky.

### Poznámka ke zbytkům Inter, Roboto a Epilogue

Živý web na několika místech ještě obsahuje `Inter` (globální výchozí nastavení
Elementoru a jeden prvek na úvodní stránce), `Roboto` (rozbalovací menu) a
`Epilogue`. **Nejsou to designová rozhodnutí — jsou to zbytky z doby před
převodem webu do Poppins.**

Replika je **nepřebírá**. Používá Poppins všude, tedy stav, jaký měl web mít.
Bylo by chybou replikovat opomenutí jen proto, že jsou v produkci.

**Český text:** pevné mezery za jednopísmennými předložkami a spojkami
(`k`, `s`, `v`, `z`, `a`, `i`, `o`, `u`) — jinak zůstávají na konci řádku sirotci.

## 5. Layout a rozestupy

| Věc | Hodnota | Poznámka |
|---|---|---|
| Šířka obsahu | `900px` | měřeno na živém webu; text se nikdy neroztahuje přes celou šířku okna |
| Zlomy | `1024px`, `767px` | jen dva, víc není potřeba |
| Výška hero sekce | `65vh` / `45vh` / `28vh` | desktop / ≤1024 / ≤767 |

**Rytmus:** rozestupy odvozuj z jedné základní jednotky (8 px) a jejích násobků.
Nemíchej libovolná čísla — layout pak působí roztřeseně, i když to nikdo neumí
pojmenovat.

## 6. Komponenty

| Komponenta | Kdy | Jak vypadá |
|---|---|---|
| Hero | pouze úvodní stránka | fotografie přes celou šířku, přes ni jeden nadpis a dva odkazy |
| Navigace | každá stránka | vodorovná, textová, bez ikon, bez zvýraznění aktivní položky barvou |
| Textová stránka | O mně, Impressum | nadpis, odstavce v šířce obsahu, případné fotografie s popiskem |
| Popisek fotografie | pod fotografií | tlumená barva, velikost jako navigace, jedna věta |
| Patička | každá stránka | copyright, právní odkazy, odkaz na Facebook — jednořádkově |

**Hero fotografie na živém webu:** `MH-DSC09654-Aegean-Sunset.jpg`.

## 7. Do a Don't

> **Stav: předběžné.** Tahle sekce zatím **není schválená.** Vznikla odvozením
> ze zamčeného design systému, ne z Michalova rozhodnutí. Cílem tohoto projektu
> je funkční pipeline, ne přesná vizuální shoda — exaktní GUI design se bude
> řešit samostatně. Do té doby ber pravidla níže jako **výchozí nastavení, od
> kterého se lze po dohodě odchýlit**, ne jako tvrdé zákazy.

**Dělej:**

- Přidávej prvky až tehdy, když bez nich stránka nefunguje.
- Drž jeden font a dva typografické stupně.
- Nech fotografiím prostor — raději větší než menší.
- Kontrast hlídej na WCAG AA, u běžného textu miř na AAA. Bílá na černé to splňuje
  s velkou rezervou, tak si ji nekaz šedivěním textu.

**Výchozí omezení** (odchylka je možná, ale má se vyslovit, ne prosadit potichu):

- ⚠️ **gradienty** — ve výchozím stavu ne, ale Michal je na webu v konkrétních
  případech používá. Než je někam přidáš nebo odebereš, zeptej se.
- ❌ stíny pod prvky
- ❌ zaoblené rohy u fotografií
- ❌ ikonky vedle nadpisů
- ❌ druhý font
- ❌ hex kód barvy přímo v komponentě místo tokenu
- ❌ animace při scrollování

**Tvrdé pravidlo, které platí bez ohledu na stav sekce:**

- ❌ **žádné výzvy k akci** typu „Kontaktujte mě" nebo „Objednat". Web je neprodejní
  záměrně, ne opomenutím — viz sekce 1.

## 8. Jak zadávat práci agentovi

**Stavba:**
> „Postav [co] podle DESIGN.md. Použij tokeny, ne vlastní hodnoty. Když ti nějaké
> pravidlo chybí, zeptej se místo vymýšlení."

**Kontrola:**
> „Vyrenderuj [co], udělej screenshot v šířce 1440 px a 390 px, porovnej
> s DESIGN.md a vypiš odchylky. Neopravuj, jen vypiš."

**Úklid:**
> „Najdi v CSS všechny hodnoty zapsané napřímo místo tokenu z DESIGN.md a nahraď je."

---

## 9. Známý rozpor mezi dokumentací a realitou

Dokument *„Migrace Projektové Historie"* (Google Drive, únor 2026) zamyká jiný
design systém, než jaký živý web skutečně používá:

| Věc | Dokument | Živý web (měřeno 4. 8. 2026) |
|---|---|---|
| Pozadí | `#111111` | `#000000` |
| Text | `#E0E0E0` | `#FFFFFF` |
| Nadpisy | `#F2F2F2` | `#FFFFFF` |
| Sub-brand barvy | `#5E728E`, `#B24238`, `#8D9B86`, `#D8CFC5` | v CSS se nevyskytují |
| Fonty | Ethnocentric Light, Proxima Nova Semibold | Poppins |

**Rozhodnutí pro tuto repliku: řídíme se živým webem.** Cílem je replika toho, co
existuje, ne implementace nenaplněného záměru.

**Principy a zákazy naopak přebíráme z dokumentu** — žádné gradienty, kontrast
WCAG AA–AAA, žádné lokální přepisy barev, „architektura před stylingem". Ty se
s realitou nerozcházejí, jen v ní nebyly zapsané.

Rozhodnutí, který z těch dvou stavů je ten správný, **není součástí tohoto projektu**.
Je to položka v backlogu PACT: *„Sladit design systém webu s dokumentem (nebo naopak)."*
