# Brand pack — podklady k DESIGN.md

Odkud pochází hodnoty v `DESIGN.md`. Zaznamenáno, aby šlo kdykoli ověřit nebo
zopakovat, až se živý web změní.

**Datum sběru:** 4. 8. 2026

## Zdroje

| Co | Odkud |
|---|---|
| Barvy a typografie | Elementor CSS živého webu — globální proměnné `--e-global-color-*` a `--e-global-typography-*` |
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

1. **Web používá jediný font — Inter.** Načítá sice i Poppins, Roboto a Epilogue,
   ale všechny globální typografické styly Elementoru odkazují na Inter. Ostatní
   rodiny tahají pluginy a v designu se neprojevují. Replika je nenačítá.

2. **Web je vícejazyčný** přes plugin TranslatePress — česká verze je výchozí,
   anglická na `/en/`. Etapa 1 řeší jen češtinu.

3. **Galerie běží na pluginech Meow Gallery a Meow Lightbox.** Relevantní pro
   Etapu 2 jako srovnání, co má náhrada umět.

## Screenshoty

Složka `screenshots/` je zatím prázdná. Vizuální snímky živého webu se pořídí
při screenshot review (úkol 10), kdy se budou porovnávat proti replice —
tam mají největší hodnotu a vzniknou obě sady najednou.
