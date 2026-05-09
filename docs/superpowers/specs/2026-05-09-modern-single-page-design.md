# Modernizacja grazkowegrafiki.com — single-page redesign

**Data:** 2026-05-09
**Zakres:** Przebudowa strony głównej w układ single-page scroll z filtrowaną siatką prac i lightboxem; ukrycie podstron „Jak zamówić" i „Cennik" z menu; refresh typografii i palety w stylu *editorial / minimal*.

## Cel

Strona ma sprawiać wrażenie nowoczesnego portfolio artystki: jeden ciągły flow od „Hej" do „Skontaktuj się", z portfelem prac jako sekcją-bohaterem. Zachowujemy charakter osobisty (ciepła paleta, treść po polsku), ale rezygnujemy ze starego, pociętego wieloplikowego układu odziedziczonego po szablonie Squarespace.

## Założenia (zatwierdzone w brainstormie)

1. **Single-page scroll** — sekcje Hero · Prace · O mnie · Opinie · Kontakt + footer.
2. **Filtrowana siatka prac** — masonry grid z chipami filtra (Wszystkie / Komiksowe / Kreskówkowe / AkwareLOVE / Zaproszenia / Gadżety / Gry).
3. **Lightbox** dla pojedynczej pracy: tryb A (zdjęcie + nawigacja w obrębie filtra), tryb B (zdjęcie + opis + mini-galeria + link do bogatej podstrony — tylko Owoce Ducha).
4. **Ukrycie z menu** plików `jak-zamowic.html` i `cennik.html` — pliki zostają na dysku, znikają linki w nawigacji.
5. **Stare podstrony galerii** (`portrety-komiksowe.html`, `portrety-kreskowkowe.html`, `portrety-w-praktyce.html`, `portrety-w-praktyce-1.html`, `zaproszenia-i-kartki-okolicznosciowe.html`) — zostają jako fallback / SEO, brak linków z nowego menu.
6. **Mini-gry** (`skate.html`, `dino-vs-kosmici/`) — poza zakresem tej iteracji, bez zmian.
7. **Aesthetic kierunek:** Editorial / Minimal — kremowe tło, serifowe nagłówki, jeden ciepły accent.

## Architektura techniczna

Stack pozostaje: **vanilla HTML + CSS + JS**, hosting GitHub Pages, brak build-stepu, brak frameworków.

### Struktura plików

```
grazkowegrafiki.com/
├── index.html                      ← PRZEPISANY (single-page)
├── legacy/
│   └── index.html                  ← kopia poprzedniej wersji (na wglądu, nie linkowana)
├── dist/
│   ├── css/
│   │   ├── main.css                ← zostaje (legacy podstron)
│   │   └── modern.css              ← NOWY: cały styl single-page
│   └── js/
│       ├── main.js                 ← zostaje (legacy podstron)
│       └── modern.js               ← NOWY: nawigacja, filtr, lightbox
├── data/
│   └── works.json                  ← NOWY: lista prac
├── tools/
│   └── extract_works.py            ← NOWY: skrypt do wygenerowania works.json z istniejących galerii
│
├── o-mnie.html, opinie.html, contact.html        ← orphan, brak linka z menu
├── regulamin.html                                 ← link tylko w stopce
├── jak-zamowic.html, cennik.html                 ← orphan, brak linka
├── portrety-*.html, zaproszenia-*.html           ← orphan fallback
├── gra-owoce-ducha.html                          ← zostaje (lightbox może linkować „Zobacz więcej")
├── skate.html, dino-vs-kosmici/                  ← bez zmian
└── assets/                                       ← bez zmian
```

### Dane prac (`data/works.json`)

Lista obiektów. Pole `description`/`gallery`/`moreUrl` opcjonalne — występuje tylko dla prac z bogatą treścią (na razie tylko `owoce-ducha`).

```json
[
  {
    "id": "portret-rodzinny-mama-dzieci",
    "category": "komiksowe",
    "title": "Portret rodzinny",
    "thumb": "assets/portret-rodzinny-mama-dzieci-ramka_rwc_640.png",
    "full":  "assets/portret-rodzinny-mama-dzieci-ramka_rwc_787.png",
    "alt": "Komiksowy portret rodziny — mama z dziećmi"
  },
  {
    "id": "owoce-ducha",
    "category": "gry",
    "title": "Owoce Ducha",
    "thumb": "assets/owoce-ducha-pudelko-komunia_rwc_640.png",
    "full":  "assets/owoce-ducha-pudelko-komunia_rwc_1242.png",
    "alt": "Gra Owoce Ducha — pudełko",
    "description": "Gra wydana przez Wydawnictwo Kościuszko. To była dopiero frajda — współtworzyć grę!",
    "gallery": ["assets/owoce-ducha-…_1.png", "assets/owoce-ducha-…_2.png"],
    "moreUrl": "gra-owoce-ducha.html"
  }
]
```

Kategorie (znormalizowane slugi): `komiksowe`, `kreskowkowe`, `akwarelove`, `zaproszenia`, `gadzety`, `gry`.

Wstępną wersję `works.json` generuje `tools/extract_works.py` parsując 6 plików źródłowych: 5 podstron galerii (`portrety-komiksowe.html`, `portrety-kreskowkowe.html`, `portrety-w-praktyce.html`, `portrety-w-praktyce-1.html`, `zaproszenia-i-kartki-okolicznosciowe.html`) + `gra-owoce-ducha.html` (kategoria `gry`, dodaje `description` i `moreUrl`). Skrypt wyciąga `<img src>`, `alt`, mapuje na kategorię na podstawie pliku źródłowego. Po wygenerowaniu Joanna dopina tytuły / opisy ręcznie.

## Komponenty single-page (`index.html` + `modern.css` + `modern.js`)

### 1. Sticky top nav
- Wysokość 64px, tło `rgba(251,247,241,0.85)` z `backdrop-filter: blur(12px)`.
- Logo (tekst „Grażkowe Grafiki" w serifie) po lewej, linki po prawej: Prace · O mnie · Opinie · Kontakt.
- Linki to anchor-scroll (`#prace`, `#o-mnie`, `#opinie`, `#kontakt`) ze smooth-scroll i scroll-spy podświetlającym aktywną sekcję (IntersectionObserver).
- Mobile (≤768px): hamburger → off-canvas panel z tymi samymi linkami.

### 2. Hero (`#top`, ~80vh)
- Layout dwukolumnowy desktop (60/40), pionowy stack mobile.
- Lewa kolumna: H1 serifowy „Hej, miło Cię widzieć!", krótki podtytuł (~2 zdania), CTA `[ Zobacz prace → ]` (anchor do `#prace`), scroll-hint (↓) na dole.
- Prawa kolumna: jedna featured grafika (hardcoded URL w HTML — wybór konkretnej pracy do podjęcia w trakcie implementacji).

### 3. Prace (`#prace`) — sekcja-bohater
- Nagłówek H2 + podkreślenie.
- **Pasek filtra**: 7 chipów (Wszystkie + 6 kategorii). Aktywny chip wypełniony kolorem accentu, nieaktywne outline. Stan filtra w URL hash: `#prace?filter=akwarelove`.
- **Grid**: CSS columns-based masonry (3 kol desktop, 2 tablet, 1 mobile). Karty mają różne wysokości (zachowane proporcje obrazków).
- **Karta**: `<a>` z `<img loading="lazy">` + overlay z tytułem (pojawia się przy hover, na mobile zawsze widoczny przy dolnej krawędzi).
- **Hover**: scale(1.03) + box-shadow, transition 200ms.
- **Filtrowanie**: JS przełącza klasę `.is-hidden` na kartach, CSS animuje opacity → po 200ms `display:none` (re-flow masonry).
- **Klik karty** → `openLightbox(workId)`.
- **Pusta kategoria** → komunikat „Wkrótce więcej!".

### 4. O mnie (`#o-mnie`)
- Dwukolumnowy: po lewej zdjęcie Joanny (z `images/Joanna_Chromiec.png`), po prawej tekst (~3-4 akapity skrócone z `o-mnie.html`) + pojedynczy cytat-akcent w serifie.
- Mobile: zdjęcie nad tekstem.

### 5. Opinie (`#opinie`)
- Grid 3 kolumny desktop, 1 mobile.
- Karta opinii: duży cudzysłów („) w kolorze accentu, treść, podpis „— Imię".
- Treść: skopiowana z `opinie.html` (parsowana z istniejącej struktury HTML).
- Jeśli > 6 opinii: domyślnie wyświetla 6 + przycisk „Pokaż więcej" rozwija resztę (czysty CSS toggle przez `<details>` lub mały JS).

### 6. Kontakt + footer (`#kontakt`)
- Sekcja kontakt: tytuł + adres email (mailto link) + ikony social (FB, IG) + formularz zamówienia (przeniesiony 1:1 z `contact.html`, zachowuje istniejącą integrację Web3Forms AJAX).
- Stopka: cienka linia oddzielająca, po lewej `© 2026 Grażkowe Grafiki`, po prawej link do `regulamin.html`.

### 7. Lightbox

**Tryb A — zwykła praca:**
- Fullscreen overlay, tło `rgba(0,0,0,0.92)`.
- Centralnie: pełne zdjęcie (`full` URL), pod nim tytuł.
- Strzałki ←/→ na bokach (klawiatura: arrow keys), licznik pozycji w prawym dolnym rogu (`7 / 28`).
- Nawigacja w obrębie aktualnie aktywnego filtra (po wyjściu poza listę: zawija się).
- Zamknięcie: × w prawym górnym, klik tła, ESC.
- Mobile: swipe lewo/prawo.

**Tryb B — praca z opisem (Owoce Ducha):**
- Layout dwukolumnowy w lightboxie: lewa kolumna obraz + mini-galeria (kropki/strzałki dla `gallery`), prawa tytuł + opis + przycisk `[ Zobacz więcej → ]` linkujący do `moreUrl`.
- Reszta jak tryb A (zewnętrzne strzałki ←/→ przeskakują do następnej pracy w filtrze, nie do następnego obrazka w mini-galerii).
- Mobile: stack pionowy.

## Paleta i typografia (baseline)

- **Tło:** `#FBF7F1` (kremowy)
- **Tekst:** `#2A2A2A` (grafit)
- **Tekst pomocniczy:** `#6B6B6B`
- **Accent:** `#C66B4A` (terakota — placeholder, do potwierdzenia z palety akwareli Joanny)
- **Headings font:** Fraunces (Google Fonts, weight 500-700)
- **Body font:** Inter (Google Fonts, weight 400-500)
- Wszystkie animacje: `transition: ... 200ms ease-out`

## Edge cases / fallbacks

- **JS wyłączony**: HTML zawiera wszystkie karty wbudowane (przed JS-render), filtry/lightbox nie działają, klik karty prowadzi do starej podstrony galerii (np. `portrety-komiksowe.html`). Strona dalej w pełni czytelna i nawigowalna.
- **Brakujący obraz**: `<img>` ma handler `onerror` ukrywający kartę.
- **Powolne ładowanie**: `loading="lazy"` na thumbnaile gridu, full image w lightboxie z prostym spinnerem.
- **Backlinki do ukrytych podstron**: pliki dalej dostępne pod URL — żaden istniejący link z zewnątrz nie zepsuje się.
- **Stare menu w plikach orphan**: `o-mnie.html`, `opinie.html`, `contact.html`, stare galerie i `gra-owoce-ducha.html` zachowują własne, stare menu w środku — z linkami do `jak-zamowic.html` i `cennik.html`. Ktoś, kto trafi na orphan przez stary URL, zobaczy stare menu. Świadoma konsekwencja decyzji „zostaw pliki jako fallback" — czyszczenie legacy nawigacji jest poza zakresem tej iteracji.

## Plan implementacji (wysokopoziomowy)

1. `tools/extract_works.py` — generator `data/works.json` z istniejących 6 podstron galerii.
2. Szkielet `index.html` (semantyczny HTML wszystkich sekcji, bez stylowania) + `dist/css/modern.css` (reset + zmienne) + `dist/js/modern.js` (puste hooki).
3. Sticky top nav + scroll-spy.
4. Sekcja Hero.
5. Sekcja Prace: render gridu z `works.json`.
6. Filtrowanie + URL hash.
7. Lightbox tryb A (zdjęcie + nawigacja w obrębie filtra).
8. Lightbox tryb B (mini-galeria + opis + link „Zobacz więcej").
9. Sekcje O mnie + Opinie + Kontakt + Footer (treść z istniejących podstron).
10. Responsywność (breakpointy 768px, 1024px) + mobile hamburger menu.
11. Skopiowanie obecnego `index.html` do `legacy/index.html`.
12. Smoke test w przeglądarce + Lighthouse.

## Kryteria akceptacji

- Strona główna ładuje się jako single-page z 5 sekcjami w wymienionej kolejności.
- Filtr w sekcji Prace działa dla wszystkich 6 kategorii + „Wszystkie".
- Stan filtra zachowuje się przy odświeżeniu (URL hash).
- Lightbox tryb A: otwarcie z karty, nawigacja ←/→, zamknięcie ESC, działa na mobile (swipe).
- Lightbox tryb B: pojawia się dla Owoców Ducha z opisem i linkiem do `gra-owoce-ducha.html`.
- Brak linka „Jak zamówić" i „Cennik" w nawigacji desktop i mobile (pliki dostępne pod URL).
- Stare podstrony galerii dostępne pod URL, brak linków z nowego menu.
- Z wyłączonym JS strona pokazuje wszystkie prace (bez filtra) i klik karty prowadzi do starej podstrony galerii.
- Lighthouse: Performance / Accessibility / SEO ≥ 90 na desktop i mobile.
- Wygląda dobrze w Chrome i Safari na 320px / 768px / 1280px / 1920px.

## Poza zakresem (nie w tej iteracji)

- Refresh `gra-owoce-ducha.html` — zostaje w obecnej formie (lightbox linkuje, ale strona docelowa nie jest przeprojektowywana).
- Mini-gry `skate.html`, `dino-vs-kosmici/` — bez zmian.
- Refresh stron `regulamin.html`, `o-mnie.html`, `opinie.html`, `contact.html` — zostają jako orphan fallback w starej formie.
- CMS / generator statyczny / framework — vanilla zostaje.
- Internacjonalizacja (strona pozostaje po polsku).
- Analytics / SEO meta poza standardem (og:image, og:title — kopiujemy z obecnej strony).
- Wybór ostatecznego accent koloru i konkretnej featured grafiki w hero — do uzgodnienia w trakcie implementacji.
