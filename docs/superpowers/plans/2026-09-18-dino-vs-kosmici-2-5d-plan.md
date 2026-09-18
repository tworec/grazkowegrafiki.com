# Dino kontra Kosmici 2.0 — plan przebudowy na 2.5D

**Data:** 2026-09-18
**Zakres:** Przebudowa istniejącej gry `dino-vs-kosmici/dino-vs-kosmici.html` w miejscu (ten sam URL), etapami, z których każdy zostawia grę działającą i osobno zacommitowaną. Rzut 2.5D (rombowa ziemia, płaskie sprite'y sortowane po Y), lepsze sterowanie dotykowe, bogatsza walka i dźwięk. Nowa grafika generowana w ChatGPT w stylu akwarelowych rysunków Antosia.

## Decyzje (zatwierdzone 2026-09-18)

1. **Rzut 2.5D, nie pełna izometria.** Ziemia jako romby 2:1 w perspektywie 3/4, postacie pozostają dwukierunkowe (lewo/prawo, lustro). Osie świata pokrywają się z osiami ekranu (x w prawo, y w dół), więc ruch i kolizje nie wymagają przeliczeń izometrycznych. Głębia = y stóp.
2. **Przebudowa w miejscu.** Kod rozbijany na moduły ES w `dino-vs-kosmici/js/`, ładowane przez `<script type="module">`. Bez bundlera, działa na GitHub Pages. Po każdym etapie gra jest grywalna.
3. **Priorytet: telefon i tablet.** Dotyk pierwszy (joystick, duże przyciski, 30 FPS domyślnie), klawiatura jako dodatek. Testy na iPadzie/telefonie po każdym etapie.
4. **Grafika z ChatGPT.** Gra jest publiczna na GitHubie, więc wysyłanie referencji do OpenAI nie jest problemem. Pobranie każdego pliku wymaga potwierdzenia użytkownika w czacie.

## Stan wyjściowy (diagnoza)

- Jeden plik HTML, 2900 linii, cały kod w IIFE. Świat = ekran, brak kamery; na dużym monitorze sprite'y są malutkie, na telefonie ściśnięte.
- Tłumienie prędkości gracza liczone na klatkę (`vx *= 0.85`), więc prędkość zależy od FPS i realnie wynosi ok. 130 px/s zamiast 220.
- Walka: pazur co 0,5 s, ogon co 10 s, ogień co 60 s. Praktycznie gra się samym pazurem. Kosmici tylko podchodzą i gryzą; baza strzela strzałami.
- Dźwięk: syntetyczne beepy z WebAudio, brak muzyki.
- Martwy kod: procedury `drawStego/drawTyranno/drawDiplo` (ok. 300 linii) nie są używane, bo grają sprite'y. Ok. 6 MB nieużywanych PNG źródłowych w `assets/`.
- Błąd: ekran przegranej zawsze pisze "Stegozaur padł".

## Architektura docelowa

```
dino-vs-kosmici/
├── dino-vs-kosmici.html      ← markup + CSS HUD, ładuje js/main.js
├── js/
│   ├── main.js               ← boot, pętla, resize, tryb zasilania
│   ├── config.js             ← stałe: rozmiar mapy, gatunki, trudność, koszty
│   ├── state.js              ← obiekt stanu gry, buildLevel, restart
│   ├── input.js              ← klawiatura, joystick, przyciski, dash
│   ├── camera.js             ← śledzenie gracza, zoom od wysokości okna, clamp do mapy
│   ├── world.js              ← mapa: kafelki, propsy, kolizje ze skałami/pniami
│   ├── entities/
│   │   ├── player.js         ← ruch, ataki, gatunki
│   │   ├── aliens.js         ← typy wrogów i ich AI
│   │   ├── bases.js          ← bazy, fale, strzelanie
│   │   ├── allies.js         ← stado
│   │   └── projectiles.js
│   ├── render/
│   │   ├── sprites.js        ← atlas, arkusze, drawSprite
│   │   ├── ground.js         ← cache rombowej ziemi (offscreen canvas per chunk)
│   │   ├── draw.js           ← y-sort, cienie, rysowanie encji, FX
│   │   └── hud.js            ← paski, cyfry bitmapowe, minimapa
│   ├── audio.js              ← SFX + muzyka
│   └── util.js
├── assets/                   ← tylko pliki używane w grze
└── assets-src/               ← źródła (rysunki Antosia, arkusze przed cięciem)
```

Zasady:
- Współrzędne świata w "jednostkach świata" (1 = px przy zoomie 1). Kamera skaluje tak, żeby wysokość widoku wynosiła stałe ~720 jednostek, więc dino ma ten sam rozmiar względny na każdym ekranie.
- Mapa 3×2 ekrany bazowe (ok. 3600×1440 jednostek), z możliwością zmiany w `config.js`.
- Każda rysowalna rzecz ma `feetY` używane do sortowania. Drzewa i bazy przestają być na warstwie statycznej; statyczna zostaje tylko ziemia.
- Ziemia to romby 128×64 z kilku wariantów trawy, ścieżki i ziemi, cache'owane w chunkach 512×512, rysowane tylko widoczne chunki.

## Etapy

Każdy etap kończy się: test w Chrome (desktop) i na telefonie, commit z prefiksem `dino:`.

### Etap 0 — Rozbicie na moduły i naprawa błędów (bez zmian w rozgrywce)

- Wyciągnąć kod z IIFE do modułów wg struktury wyżej. Zachowanie identyczne.
- Usunąć martwe procedury rysowania dino, przenieść nieużywane PNG do `assets-src/`.
- Naprawić tłumienie ruchu (zależne od dt), komunikat przegranej z nazwą gatunku.
- Dodać `?debug=1` z licznikiem FPS i liczbą encji.

Kryterium: gra wygląda i gra się tak samo jak przed etapem, plik HTML ma < 400 linii.

### Etap 1 — Kamera, duża mapa, głębia

- `camera.js`: lerp za graczem, zoom od wysokości okna, clamp do granic mapy.
- Mapa 3×2, propsy rozłożone po całej mapie, bazy w odległych rogach, pady bliżej startu.
- Y-sort wszystkich encji i propsów, eliptyczne cienie pod postaciami i propsami.
- Kolizje z pniami drzew (małe koło u podstawy), skały bez zmian.
- Minimapa w HUD: bazy, gracz, pady, sojusznicy.
- Wskaźnik kierunku do najbliższej bazy na krawędzi ekranu, gdy jest poza widokiem.

Kryterium: dino ma ten sam rozmiar na iPadzie i monitorze, można "wejść za drzewo", bazy widać na minimapie.

### Etap 2 — Rombowa ziemia i teren

- Zestaw kafelków z ChatGPT (patrz "Pipeline grafiki"): 3 warianty trawy, ziemia, ścieżka z krawędziami, ew. woda jako przeszkoda.
- Generator mapy: losowe plamy ziemi, ścieżka łącząca start z bazami, propsy unikające ścieżek.
- `ground.js`: cache chunków, rysowanie tylko widocznych.
- Nowe propsy w stylu Antosia: pniak, kwiaty, kości dino, krater po statku.

Kryterium: mapa czytelnie wygląda na 3/4-perspektywę, stałe 30 FPS na telefonie.

### Etap 3 — Sterowanie i "feel"

- Joystick: martwa strefa, pływający (pojawia się tam, gdzie dotknięto lewą połowę ekranu).
- Dash na przycisku skoku: krótki zryw z nietykalnością 0,2 s, cooldown 1,5 s. Zastępuje skok, który mechanicznie nic nie robił.
- Hit-stop 50 ms i lekkie trzęsienie ekranu przy trafieniu, `navigator.vibrate` na telefonie, liczby obrażeń.
- Klawiatura: WASD/strzałki, Z/X/C, spacja = dash. Na desktopie ogień celowany myszą, jeśli mysz się ruszała w ostatniej sekundzie.
- Przyciski ataku z ikoną cooldownu i licznikiem energii na przycisku.
- Animacja ruchu postaci, warstwa kodu (działa na obecnych arkuszach):
  - faza kroku sprzężona z prędkością i długością kroku, klatka zmienia się co ~0,4 jednostki drogi, nie co ułamek sekundy;
  - squash & stretch przy każdym kontakcie stopy z ziemią (skalowanie 1,04/0,96), pochylenie sylwetki w kierunku ruchu do 6°;
  - obrót: krótki tween skali X przez 80 ms zamiast natychmiastowego lustra;
  - idle jako oddychanie (skala Y 1,0–1,02) plus mrugnięcie, zamiast przewijania klatek walk;
  - kurz spod stóp przy każdym kroku, ślad przy dashu;
  - ataki z antycypacją: 60 ms cofnięcia, uderzenie, 120 ms powrotu;
  - stado i kosmici na tej samej maszynie animacji.
- Animacja ruchu postaci, warstwa grafiki (ChatGPT): nowe cykle chodu z prawdziwymi pozami kluczowymi (kontakt, dół, przejście, góra) po 8 klatek dla 3 dino, w jednym stylu Antosia. Obecny stego jest w innym, wektorowym stylu, a 4 klatki tyranno prawie nie różnią się pozą, przez co dino "sunie".

Kryterium: ruch odczuwalnie responsywny, stopy wyraźnie stawiają kroki, dash pozwala uniknąć strzały z bazy.

### Etap 4 — Walka, wrogowie, fale

- Ataki: pazur jako combo 3 uderzeń (trzecie mocniejsze), ogon co 3 s z odrzutem, ogień jako trzymany stożek płacący energią na sekundę. Unikaty gatunków zostają (tarcza stego, odrzut diplo, gryz tyranno).
- Nowi wrogowie (side view, z ChatGPT): strzelec trzymający dystans, biegacz szarżujący, tarczownik odporny z przodu, boss na koniec każdej fali.
- Fale z jawnym licznikiem, 10 s przerwy między falami, komunikat "Fala N" na środku.
- Balans: tabela HP/dmg/prędkości w `config.js`, jedna zmienna trudności skaluje wszystko.

Kryterium: fala 3 jest wygrywalna na Normal, ale wymaga użycia wszystkich trzech ataków.

### Etap 5 — Progresja i ekrany

- Ekran startowy: wybór gatunku (3 karty ze sprite'em i opisem), trudność, przycisk graj.
- Awans poziomu: wybór 1 z 3 kart ulepszeń zamiast automatu (pad leczy, ale nie ulepsza).
- Pauza (przycisk w HUD i klawisz Esc), ekran końca z wynikiem i rekordem w `localStorage`.
- Instrukcja dotykowa przy pierwszym uruchomieniu (3 plansze).

### Etap 6 — Dźwięk

- Muzyka: dwie pętle (spokojna/bojowa) z przejściem przy starcie fali. Źródło: darmowe CC0 lub własna synteza w WebAudio; ChatGPT nie generuje audio, więc tu bez niego.
- SFX: ryk dino per gatunek przy ogniu, losowa wysokość dźwięków trafień, alarm bazy przed strzałem, dźwięk dash.
- Przycisk wyciszenia w HUD, stan w `localStorage`.

## Pipeline grafiki (ChatGPT w Chrome użytkownika)

Jeden wątek w ChatGPT na jedną postać lub jeden zestaw kafelków, żeby generator trzymał kontekst stylu.

1. **Referencja stylu.** Claude otwiera chatgpt.com, wgrywa 2 pliki z `assets-src/`: rysunek dino Antosia i fragment atlasu propsów. Pierwszy prompt ustala styl: "akwarela z konturem ołówkiem, papierowa faktura, płaskie cienie, przezroczyste tło" i prosi tylko o potwierdzenie, bez obrazka.
2. **Poza bazowa.** Prośba o jedną pozę stojącą, widok z boku, postać patrzy w prawo, w kwadracie o stałym rozmiarze, stopy na dolnej krawędzi. Iteracja aż styl pasuje do Antosia. Ta poza jest kotwicą dla wszystkich kolejnych.
3. **Klatki animacji.** Nie jeden prompt "zrób arkusz 8 klatek", bo wtedy proporcje płyną. Zamiast tego każda poza kluczowa jako edycja pozy bazowej: "ta sama postać, ten sam rozmiar, lewa noga z przodu w kontakcie z ziemią", potem "noga przechodzi pod ciałem", itd. 4 pozy kluczowe na cykl chodu, 3 na atak. Międzyklatki robi kod (tween skali i pochylenia), nie generator.
4. **Kontrola.** Claude ogląda wynik na screenshocie i porównuje z pozą bazową. Odrzuca, gdy zmienił się kolor, liczba kolców, grubość konturu lub proporcje głowy.
5. **Pobranie.** Claude pyta w czacie o zgodę na pobranie, użytkownik potwierdza, plik ląduje w `assets-src/<postać>/<poza>.png`.
6. **Obróbka w Pythonie (Pillow):** usunięcie tła (gdy generator dał szachownicę zamiast alfy), wyrównanie po linii stóp i środku ciężkości, jednolita skala po wysokości tułowia, złożenie w arkusz o stałej siatce, zapis do `assets/`. Skrypt w `dino-vs-kosmici/tools/build_sheet.py`, powtarzalny.
7. **Test w grze** z `?debug=1`: podgląd cyklu w pętli obok obecnej wersji.

Kolejność generowania:
- Etap 2: kafelki ziemi (trawa ×3, ziemia, ścieżka prosta/zakręt/koniec), 4 nowe propsy.
- Etap 3: cykle chodu 3 dino (4 pozy kluczowe każdy), ataki (3 pozy), nowy stego w stylu Antosia zamiast obecnego wektorowego.
- Etap 4: 4 typy wrogów (poza bazowa + 4 pozy chodu + 2 ataku), boss.
- Etap 5: 3 karty gatunków (portret), ikony ulepszeń.

Ryzyko: spójność klatek z generatora. Plan B, jeśli edycje pozy bazowej dryfują: tylko poza bazowa i osobno wygenerowane nogi jako warstwa, animowane proceduralnie (jak dziś stado rysowane kodem).

Wniosek z próby 2026-09-18 (`assets-src/tiles/grass-iso-test.png`): pojedyncze kafelki-romby z ChatGPT mają kontur i ziemny bok, przez co w siatce widać szczeliny, a proporcje nie trzymają 2:1. Do wnętrza mapy zamawiać **bezszwowe kwadratowe tekstury** (trawa, ziemia, ścieżka) w stylu Antosia, a romby, krawędzie i cienie rysować kodem. Kafelek z bokiem zostaje jako wzór krawędzi mapy.

## Poza zakresem tej przebudowy

- Pełna izometria z postaciami w 4 kierunkach.
- Multiplayer, zapis stanu gry w trakcie.
- Zmiany na stronie głównej grazkowegrafiki.com poza linkiem do gry.

## Kolejność i szacunek

| Etap | Zależności | Orientacyjnie |
|------|-----------|---------------|
| 0 moduły | — | 1 sesja |
| 1 kamera | 0 | 1 sesja |
| 2 teren | 1, grafika | 2 sesje |
| 3 feel | 0 | 1 sesja |
| 4 walka | 3, grafika | 2 sesje |
| 5 ekrany | 4 | 1 sesja |
| 6 dźwięk | 0 | 1 sesja |

Etapy 3 i 6 nie zależą od 1 i 2, więc można je przeplatać, gdy czekamy na grafikę.

## Status (aktualizowany po każdym etapie)

- 2026-09-18: **Etap 0 zrobiony**, commit `a3b2cfc` (moduły ES w `dino-vs-kosmici/js/`, naprawy, `?debug=1`). Lokalny test wymaga serwera HTTP: `python3 -m http.server 8765` w katalogu repo.
- 2026-09-18: **Etap 6 (dźwięk)** i **narzędzie `tools/build_sheet.py`** zlecone sub-agentom w osobnych worktree; do scalenia po ich zakończeniu (sprawdzić konflikty w `main.js`, `hud.js`).
- 2026-09-18: Próbny kafelek z ChatGPT w `assets-src/tiles/grass-iso-test.png` (wątek "Wygeneruj kafelek trawy"); wniosek w sekcji "Pipeline grafiki".
- Następne: etap 1 (kamera) albo etap 3 (feel i animacja) — kolejność do decyzji użytkownika; animacja ruchu i akcji postaci to część etapu 3 (obie warstwy: kod i grafika).
