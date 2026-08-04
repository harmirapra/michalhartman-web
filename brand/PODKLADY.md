# Brand pack — podklady k DESIGN.md

Odkud pochází hodnoty v `DESIGN.md`. Zaznamenáno, aby šlo kdykoli ověřit nebo
zopakovat, až se živý web změní.

**Datum sběru:** 4. 8. 2026

## Zdroje

| Co | Odkud |
|---|---|
| Barvy | Elementor CSS živého webu — globální proměnné `--e-global-color-*` v `post-216.css` |
| Typografie | **přepisy u jednotlivých prvků** v šablonách stránek — `post-1638.css` (O mně), `post-1171.css` (Úvod), `post-376.css` (navigace) |
| Šířka obsahu, výška hero | `post-1171.css` (šablona úvodní stránky) |
| Zlomy rozlišení | `@media` pravidla v `post-216.css` |
| Texty stránek | HTML živého webu, doslovně |
| Principy a zákazy | `architecture.md` v repu PACT, bod 5 — zamčený design systém z Google Drive |

Konkrétní soubory:

```
https://michalhartman.com/wp-content/uploads/elementor/css/post-216.css    globální styly, patička
https://michalhartman.com/wp-content/uploads/elementor/css/post-1171.css   úvodní stránka
https://michalhartman.com/wp-content/uploads/elementor/css/post-376.css    další šablona
https://michalhartman.com/wp-content/uploads/elementor/css/post-987.css    další šablona
```

## Struktura živého webu

| Stránka | Adresa | V replice Etapy 1 |
|---|---|---|
| Úvod | `/` | ✅ |
| Galerie | `/gallery/` | ❌ Etapa 2 |
| O mně | `/about/` | ✅ |
| Impressum | `/impressum/` | ✅ |
| Ochrana osobních údajů | `/privacy-policy/` | ❌ mimo rozsah |
| Nastavení cookies | `/cookie-policy-eu/` | ❌ mimo rozsah |
| Anglická verze | `/en/` | ❌ mimo rozsah |

**Adresy stránek jsou anglické** (`/about/`, ne `/o-mne/`) — replika je zachovává,
aby odpovídala originálu.

## Zjištění, která stojí za zapamatování

1. **Web používá Poppins.** Elementor má dvě vrstvy nastavení typografie:
   globální výchozí hodnoty (Site Settings) a **přepisy u jednotlivých prvků**
   v šablonách stránek. Globální vrstva ještě obsahuje `Inter` — ale každý
   viditelný prvek je přepsaný na Poppins.

   | Šablona | Co to je | Fonty |
   |---|---|---|
   | `post-1638.css` | O mně | Poppins ×6, nic jiného |
   | `post-1171.css` | Úvod | Poppins ×4, Inter ×1 |
   | `post-376.css` | navigace | Poppins ×2, Roboto ×1 (rozbalovací menu) |
   | `post-216.css` | globální výchozí | Inter ×6, Epilogue ×1 |

   **Výskyty Inter, Roboto a Epilogue jsou zbytky z doby před převodem webu do
   Poppins, ne designová rozhodnutí** — potvrdil Michal 4. 8. 2026. Replika je
   nepřebírá a používá Poppins všude.

   *Poznámka k metodě:* první měření četlo jen globální vrstvu a vyvodilo z toho
   nesprávný závěr, že web běží na Inter. Rozdíl byl podstatný — Inter 600
   (polotučné) proti skutečnému Poppins 200 (extra světlé). Ponaučení: u Elementoru
   nikdy nestačí přečíst `--e-global-typography-*`, vždy je nutné projít i šablony
   jednotlivých stránek.

2. **Web je vícejazyčný** přes plugin TranslatePress — česká verze je výchozí,
   anglická na `/en/`. Etapa 1 řeší jen češtinu.

3. **Galerie běží na pluginech Meow Gallery a Meow Lightbox.** Relevantní pro
   Etapu 2 jako srovnání, co má náhrada umět.

## Screenshoty

Složka `screenshots/` je zatím prázdná. Vizuální snímky živého webu se pořídí
při screenshot review (úkol 10), kdy se budou porovnávat proti replice —
tam mají největší hodnotu a vzniknou obě sady najednou.
