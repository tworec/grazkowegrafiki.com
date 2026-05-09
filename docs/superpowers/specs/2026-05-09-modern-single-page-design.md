# Modernizacja grazkowegrafiki.com — single-page redesign

**Data:** 2026-05-09
**Zakres:** Nowy single-page redesign zbudowany w izolowanym podkatalogu `2rec/` (testowy URL `grazkowegrafiki.com/2rec/`), bez modyfikacji żadnego z istniejących plików. Single-page scroll z filtrowaną siatką prac i lightboxem; menu nowego single-page nie zawiera „Jak zamówić" ani „Cennik"; typografia i paleta w stylu *editorial / minimal*. Promocja do roota (zastąpienie obecnego `index.html`) — w osobnej, późniejszej iteracji po akceptacji w testach.

## Cel

Strona ma sprawiać wrażenie nowoczesnego portfolio artystki: jeden ciągły flow od „Hej" do „Skontaktuj się", z portfelem prac jako sekcją-bohaterem. Zachowujemy charakter osobisty (ciepła paleta, treść po polsku), ale rezygnujemy ze starego, pociętego wieloplikowego układu odziedziczonego po szablonie Squarespace.

## Założenia (zatwierdzone w brainstormie)

1. **Izolacja w podkatalogu `2rec/`** — wszystkie nowe pliki tworzone wyłącznie w `2rec/`. Żaden istniejący plik w roocie repo nie jest modyfikowany ani przenoszony. Testowy URL: `https://grazkowegrafiki.com/2rec/` — niewidoczny z reszty strony, dostępny tylko dla osoby z linkiem.
2. **Single-page scroll** — sekcje Hero · Prace · O mnie · Opinie · Kontakt + footer.
3. **Filtrowana siatka prac** — masonry grid z chipami filtra (Wszystkie / Komiksowe / Kreskówkowe / AkwareLOVE / Zaproszenia / Gadżety / Gry).
4. **Lightbox** dla pojedynczej pracy: tryb A (zdjęcie + nawigacja w obrębie filtra), tryb B (zdjęcie + opis + mini-galeria + link do bogatej podstrony — tylko Owoce Ducha).
5. **Menu nowego single-page** zawiera: Prace · O mnie · Opinie · Kontakt. Nie zawiera „Jak zamówić" ani „Cennik". (Stare menu w istniejącym `index.html` i podstronach pozostaje nietknięte — to inny URL, root strony.)
6. **Mini-gry** (`skate.html`, `dino-vs-kosmici/`) — poza zakresem, bez zmian.
7. **Aesthetic kierunek:** Editorial / Minimal — kremowe tło, serifowe nagłówki, jeden ciepły accent.

## Architektura techniczna

Stack pozostaje: **vanilla HTML + CSS + JS**, hosting GitHub Pages, brak build-stepu, brak frameworków.

### Struktura plików

Wszystkie nowe pliki — wyłącznie w `2rec/`. Reszta repo bez zmian (oznaczona `←  bez zmian`).

```
grazkowegrafiki.com/
├── 2rec/                           ← NOWY KATALOG, cała praca tutaj
│   ├── index.html                  ← NOWY: single-page
│   ├── css/
│   │   └── modern.css              ← NOWY: cały styl
│   ├── js/
│   │   └── modern.js               ← NOWY: nawigacja, filtr, lightbox
│   ├── data/
│   │   └── works.json              ← NOWY: lista prac
│   └── tools/
│       └── extract_works.py        ← NOWY: generator works.json
│
├── docs/superpowers/specs/         ← NOWY: ten dokument (już zacommitowany)
│
├── index.html                      ← bez zmian
├── dist/css/main.css               ← bez zmian
├── dist/js/main.js                 ← bez zmian
├── o-mnie.html, opinie.html, contact.html        ← bez zmian
├── regulamin.html                                 ← bez zmian
├── jak-zamowic.html, cennik.html                  ← bez zmian
├── portrety-*.html, zaproszenia-*.html            ← bez zmian
├── gra-owoce-ducha.html                           ← bez zmian
├── skate.html, dino-vs-kosmici/                   ← bez zmian
└── assets/                                        ← bez zmian (ale używane przez 2rec/)
```

**Ścieżki względne:** `2rec/index.html` referuje wszystkie obrazki przez `../assets/...` (parent directory). To działa pod GitHub Pages — `https://grazkowegrafiki.com/2rec/` widzi `https://grazkowegrafiki.com/assets/...` przez `..`. CSS i JS w obrębie `2rec/` mają ścieżki lokalne (`css/modern.css`, `js/modern.js`).

**Promocja do roota** — nie w tej iteracji. Kiedy `2rec/` zostanie zaakceptowany w testach, osobny krok przeniesie zawartość do roota (z odpowiednią korektą ścieżek `../assets/` → `assets/`). Dotąd root pozostaje bez zmian.

### Dane prac (`data/works.json`)

Lista obiektów. Pole `description`/`gallery`/`moreUrl` opcjonalne — występuje tylko dla prac z bogatą treścią (na razie tylko `owoce-ducha`).

```json
[
  {
    "id": "portret-rodzinny-mama-dzieci",
    "category": "komiksowe",
    "title": "Portret rodzinny",
    "thumb": "../assets/portret-rodzinny-mama-dzieci-ramka_rwc_640.png",
    "full":  "../assets/portret-rodzinny-mama-dzieci-ramka_rwc_787.png",
    "alt": "Komiksowy portret rodziny — mama z dziećmi"
  },
  {
    "id": "owoce-ducha",
    "category": "gry",
    "title": "Owoce Ducha",
    "thumb": "../assets/owoce-ducha-pudelko-komunia_rwc_640.png",
    "full":  "../assets/owoce-ducha-pudelko-komunia_rwc_1242.png",
    "alt": "Gra Owoce Ducha — pudełko",
    "description": "Gra wydana przez Wydawnictwo Kościuszko. To była dopiero frajda — współtworzyć grę!",
    "gallery": ["../assets/owoce-ducha-…_1.png", "../assets/owoce-ducha-…_2.png"],
    "moreUrl": "../gra-owoce-ducha.html"
  }
]
```

Kategorie (znormalizowane slugi): `komiksowe`, `kreskowkowe`, `akwarelove`, `zaproszenia`, `gadzety`, `gry`.

Wstępną wersję `works.json` generuje `tools/extract_works.py` parsując 6 plików źródłowych: 5 podstron galerii (`portrety-komiksowe.html`, `portrety-kreskowkowe.html`, `portrety-w-praktyce.html`, `portrety-w-praktyce-1.html`, `zaproszenia-i-kartki-okolicznosciowe.html`) + `gra-owoce-ducha.html` (kategoria `gry`, dodaje `description` i `moreUrl`). Skrypt wyciąga `<img src>`, `alt`, mapuje na kategorię na podstawie pliku źródłowego. Po wygenerowaniu Joanna dopina tytuły / opisy ręcznie.

## Komponenty single-page (`2rec/index.html` + `2rec/css/modern.css` + `2rec/js/modern.js`)

### 1. Sticky top nav
- Wysokość 64px, tło `rgba(251,247,241,0.85)` z `backdrop-filter: blur(12px)`.
- Logo (tekst „Grażkowe Grafiki" w serifie) po lewej, linki po prawej: Prace · O mnie · Opinie · Kontakt.
- Linki to anchor-scroll (`#prace`, `#o-mnie`, `#opinie`, `#kontakt`) ze smooth-scroll i scroll-spy podświetlającym aktywną sekcję (IntersectionObserver).
- Mobile (≤768px): hamburger → off-canvas panel z tymi samymi linkami.

### 2. Hero (`#top`, ~80vh)
- Layout dwukolumnowy desktop (60/40), pionowy stack mobile.
- Lewa kolumna: H1 serifowy „Hej, miło Cię widzieć!", krótki podtytuł (~2 zdania), CTA `[ Zobacz prace → ]` (anchor do `#prace`), scroll-hint (↓) na dole.
- Prawa kolumna: jedna featured grafika (hardcoded `<img src="../assets/...">` — wybór konkretnej pracy do podjęcia w trakcie implementacji).

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
- Dwukolumnowy: po lewej zdjęcie Joanny (`../images/Joanna_Chromiec.png`), po prawej tekst (~3-4 akapity skrócone z `../o-mnie.html`) + pojedynczy cytat-akcent w serifie.
- Mobile: zdjęcie nad tekstem.

### 5. Opinie (`#opinie`)
- Grid 3 kolumny desktop, 1 mobile.
- Karta opinii: duży cudzysłów („) w kolorze accentu, treść, podpis „— Imię".
- Treść: skopiowana z `../opinie.html` (parsowana z istniejącej struktury HTML).
- Jeśli > 6 opinii: domyślnie wyświetla 6 + przycisk „Pokaż więcej" rozwija resztę (czysty CSS toggle przez `<details>` lub mały JS).

### 6. Kontakt + footer (`#kontakt`)
- Sekcja kontakt: tytuł + adres email (mailto link) + ikony social (FB, IG) + formularz zamówienia (skopiowany z `../contact.html` razem z istniejącą integracją Web3Forms AJAX — kopia HTML i powiązanego JS do `2rec/js/modern.js`, oryginał w `contact.html` nietknięty).
- Stopka: cienka linia oddzielająca, po lewej `© 2026 Grażkowe Grafiki`, po prawej link do `../regulamin.html`.

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

- **JS wyłączony**: HTML zawiera wszystkie karty wbudowane (przed JS-render), filtry/lightbox nie działają, klik karty prowadzi do starej podstrony galerii (np. `../portrety-komiksowe.html`). Strona dalej w pełni czytelna i nawigowalna.
- **Brakujący obraz**: `<img>` ma handler `onerror` ukrywający kartę.
- **Powolne ładowanie**: `loading="lazy"` na thumbnaile gridu, full image w lightboxie z prostym spinnerem.
- **Backlinki do istniejących stron**: cały root strony pozostaje bez zmian — żaden istniejący link z zewnątrz nie jest dotknięty.
- **Klik z `2rec/` na stary content**: klik karty (gdy JS off), klik „Zobacz więcej" w lightboxie tryb B, link „Regulamin" w stopce — wszystkie prowadzą do starych stron w roocie (`../portrety-…`, `../gra-owoce-ducha.html`, `../regulamin.html`). Gdy użytkownik klika, opuszcza nową wersję i ląduje na starej (z jej starym menu wskazującym `jak-zamowic.html`, `cennik.html` itd.). Świadoma konsekwencja modelu „nowy single-page testowy w izolacji" — pełne ujednolicenie nastąpi przy promocji `2rec/` do roota.

## Plan implementacji (wysokopoziomowy)

Wszystkie kroki tworzą wyłącznie nowe pliki w `2rec/`. Żaden istniejący plik w roocie nie jest modyfikowany na żadnym etapie.

1. Utworzenie struktury `2rec/` (pusty katalog z `css/`, `js/`, `data/`, `tools/`).
2. `2rec/tools/extract_works.py` — generator `2rec/data/works.json` z 6 plików źródłowych w roocie (5 galerii + `gra-owoce-ducha.html`).
3. Szkielet `2rec/index.html` (semantyczny HTML wszystkich sekcji, bez stylowania) + `2rec/css/modern.css` (reset + zmienne) + `2rec/js/modern.js` (puste hooki).
4. Sticky top nav + scroll-spy.
5. Sekcja Hero.
6. Sekcja Prace: render gridu z `works.json`.
7. Filtrowanie + URL hash.
8. Lightbox tryb A (zdjęcie + nawigacja w obrębie filtra).
9. Lightbox tryb B (mini-galeria + opis + link „Zobacz więcej").
10. Sekcje O mnie + Opinie + Kontakt + Footer (treść skopiowana z istniejących podstron, ścieżki `../`).
11. Responsywność (breakpointy 768px, 1024px) + mobile hamburger menu.
12. Smoke test w przeglądarce (lokalnie + po deployu na `https://grazkowegrafiki.com/2rec/`) + Lighthouse.

## Kryteria akceptacji

- `https://grazkowegrafiki.com/2rec/` ładuje się jako single-page z 5 sekcjami w wymienionej kolejności.
- `git status` po implementacji pokazuje wyłącznie nowe pliki w `2rec/` (i ewentualnie aktualizacje docs); żadnego istniejącego pliku w roocie repo nie ruszono.
- Strona pod `https://grazkowegrafiki.com/` (root) ładuje się dokładnie tak jak przed pracami — żadnej regresji.
- Filtr w sekcji Prace działa dla wszystkich 6 kategorii + „Wszystkie".
- Stan filtra zachowuje się przy odświeżeniu (URL hash).
- Lightbox tryb A: otwarcie z karty, nawigacja ←/→, zamknięcie ESC, działa na mobile (swipe).
- Lightbox tryb B: pojawia się dla Owoców Ducha z opisem i linkiem do `../gra-owoce-ducha.html`.
- Menu nowego single-page nie zawiera „Jak zamówić" ani „Cennik".
- Z wyłączonym JS strona pod `/2rec/` pokazuje wszystkie prace (bez filtra) i klik karty prowadzi do starej podstrony galerii w roocie.
- Lighthouse: Performance / Accessibility / SEO ≥ 90 na desktop i mobile.
- Wygląda dobrze w Chrome i Safari na 320px / 768px / 1280px / 1920px.

## Poza zakresem (nie w tej iteracji)

- **Promocja `2rec/` do roota** (zastąpienie obecnego `index.html`, ujednolicenie ścieżek `../assets/` → `assets/`, ukrycie / przekierowanie starych podstron) — osobna iteracja po akceptacji w testach.
- **Modyfikacje czegokolwiek poza `2rec/` i `docs/`** — wszystkie istniejące pliki w roocie (`index.html`, `dist/`, podstrony, `assets/`) pozostają nietknięte.
- Refresh `gra-owoce-ducha.html` — zostaje w obecnej formie (lightbox linkuje, ale strona docelowa nie jest przeprojektowywana).
- Mini-gry `skate.html`, `dino-vs-kosmici/` — bez zmian.
- CMS / generator statyczny / framework — vanilla zostaje.
- Internacjonalizacja (strona pozostaje po polsku).
- Analytics / SEO meta poza standardem (og:image, og:title — kopiujemy z obecnej strony).
- Wybór ostatecznego accent koloru i konkretnej featured grafiki w hero — do uzgodnienia w trakcie implementacji.
