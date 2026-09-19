# tools/ — pipeline grafiki

Narzędzia do obróbki grafiki z ChatGPT (patrz "Pipeline grafiki" w
`docs/superpowers/plans/2026-09-18-dino-vs-kosmici-2-5d-plan.md`).

## Instalacja

Tylko Python 3 + Pillow, w lokalnym venv (nie instaluj globalnie):

```bash
cd dino-vs-kosmici/tools
python3 -m venv .venv
.venv/bin/pip install pillow
```

## build_sheet.py — pozy → arkusz sprite'ów

Wejście: katalog z PNG nazwanymi `<pasmo>-<nr>.png` (np. `walk-1.png … walk-4.png`,
`idle-1.png`, `attack-1.png`). Rozmiary mogą być różne; tło może być alfą,
szachownicą (dwa jasne szare odcienie) albo jednolitym kolorem.

Co robi, po kolei:

1. usuwa tło (`--remove-bg auto|none|checker|solid`) — wykrywa je po obwódce obrazu
   i flood-filluje od krawędzi, więc białe oczy/zęby w środku postaci zostają;
2. przycina do bbox alfy, skaluje wszystkie klatki jednym współczynnikiem tak, żeby
   mediana wysokości bbox wyniosła `--height` px (domyślnie 168; `--no-scale` wyłącza);
3. stawia stopy (najniższy nieprzezroczysty rząd) na `frameH - margin`, centruje
   poziomo po środku bbox albo środku masy alfy (`--anchor bbox|mass`; `mass` jest
   stabilniejszy przy długich ogonach);
4. zapisuje poziomy pasek klatek `frameW×frameH` (parzyste; `--frame-w/--frame-h`
   wymuszają rozmiar, np. żeby pasował do istniejącej stałej w `sprites.js`),
   JSON z metadanymi i gotowy snippet JS na stdout.

```bash
.venv/bin/python build_sheet.py ../assets-src/tyranno \
    --bands idle,walk,attack \
    --out ../assets/char-tyranno.png \
    --meta ../assets-src/tyranno/sheet.json \
    --preview /tmp/tyranno-preview.png \
    --name TYRANNO_ANIM
```

Na stdout wypada blok do wklejenia w `js/render/sprites.js`:

```js
export const TYRANNO_ANIM = {
  frameW: 233, frameH: 188,
  idle:   { start:  0, count: 6 },
  walk:   { start:  6, count: 8 },
  attack: { start: 14, count: 4 }
};
```

`--bands` ustala kolejność pasm w arkuszu; bez niego pasma idą alfabetycznie.
Pasma spoza listy są pomijane (wygodne do wykluczenia szkiców).

Przydatne przełączniki: `--margin 8` (margines wokół klatki), `--tolerance 28`
(czułość na kolor tła), `--feather 140` (miękka 1-px obwódka; `0` wyłącza),
`--preview-cols 6`.

### Podgląd

`--preview plik.png` robi arkusz kontaktowy na ciemnym tle: numer klatki, nazwa
pliku źródłowego, czerwona linia stóp i oś środkowa. Otwórz i sprawdź, czy postać
nie "skacze" między klatkami.

### Cięcie arkusza (operacja odwrotna)

```bash
.venv/bin/python build_sheet.py --split ../assets/char-tyranno.png \
    --frame-w 233 --frame-h 188 \
    --bands walk:4,attack:3,breath:3 \
    --out-dir /tmp/tyranno-frames
```

Powstają `walk-1.png … breath-3.png` (bez `--bands`: `frame-1.png …`). Zamiast
`--frame-w/--frame-h/--bands` można podać `--meta sheet.json` z poprzedniego builda.
Tak poprawia się jedną klatkę: potnij, podmień PNG, złóż z powrotem z `--no-scale
--frame-w 233 --frame-h 188`.

### Test round-trip

Cięcie `assets/char-tyranno.png` i złożenie z `--no-scale --frame-w 233 --frame-h 188
--margin 10` daje arkusz o tych samych wymiarach; treść klatek jest identyczna
(różnica 0 po wyrównaniu bbox), a przesunięcie w miejscu wynosi ≤2 px w poziomie
i ≤5 px w pionie, bo oryginał nie miał wyrównanej linii stóp.

## measure_frames.py — obiektywna kontrola klatek

Nie oceniaj poz "na oko" — generator obrazów potrafi zwrócić dwie klatki, które
wyglądają na różne, a mają tę samą pozę nóg.

```bash
.venv/bin/python measure_frames.py ../assets-src/tyranno/walk-1.png ../assets-src/tyranno/walk-3.png
```

Dla każdego pliku wypisuje:

- **stopy (%)** — plamy nieprzezroczystości w dolnych 6 % wysokości bbox, jako zakresy
  w procentach szerokości. Klatka kontaktu ma **dwie** plamy, klatka przejścia (nogi
  złączone) **jedną**. Trzecia plama = artefakt trzeciej nogi.
- **nogi@76 %** — to samo w pasie 72–80 % wysokości, do wyłapania dodatkowej nogi
  tam, gdzie stopy się zlewają.
- **diff** — średnia różnica pikselowa (0–255) każdej pary po wyrównaniu do wspólnego
  kadru 320×320 i linii stóp. Poniżej ~20 klatki są praktycznie identyczne.

## leg_tone.py — która noga jest bliżej widza

```bash
.venv/bin/python leg_tone.py ../assets-src/tyranno/walk-1.png ../assets-src/tyranno/walk-3.png
```

Liczy średnią jasność nieprzezroczystych pikseli poniżej 80 % wysokości, osobno dla
lewej (tylnej) i prawej (przedniej) połowy obszaru nóg. W widoku z boku noga bliższa
widza jest rysowana jaśniej i przed tułowiem, dalsza ciemniej i za nim — więc
**znak różnicy** mówi, która noga jest wysunięta do przodu. Dwie klatki kontaktu
tego samego cyklu muszą mieć różnicę o **przeciwnych znakach**; jeśli znak jest ten
sam, generator nie zamienił nóg, choćby poza wyglądała inaczej.

## leg_tone_quad.py — to samo dla czworonogów

`leg_tone.py` dzieli obszar nóg na pół i porównuje jasność lewej i prawej połowy.
U dwunoga (tyranno) to dokładnie test „która noga jest bliżej widza". U czworonoga
(stego, diplo) lewa połowa to para TYLNA, a prawa para PRZEDNIA — każda z nich ma
jedną nogę jasną (bliższą) i jedną ciemną (dalszą), więc różnica częściowo się
znosi i wynik jest słaby (dla stego ±9…14 zamiast ±30…45).

```bash
.venv/bin/python leg_tone_quad.py ../assets-src/stego/walk-1.png ../assets-src/stego/walk-3.png
```

Skrypt najpierw dzieli obszar nóg na parę tylną i przednią, a dopiero w każdej
parze porównuje jasność nogi cofniętej i wysuniętej. To jest właściwy test zamiany
nóg dla czworonoga: **obie pary muszą zmienić znak** między walk-1 a walk-3.

## Ograniczenia

- Flood-fill idzie tylko od krawędzi: zamknięta "dziura" w kolorze tła wewnątrz
  postaci (np. między łapą a tułowiem) zostaje. Popraw ręcznie albo przytnij źródło.
- Wykrywanie tła patrzy na obwódkę obrazu; jeśli postać dotyka krawędzi na dużej
  długości, wymuś `--remove-bg solid|checker`.
- Skala jest jedna dla wszystkich klatek (mediana), więc wyraźnie za duża/za mała poza
  z generatora nadal będzie odstawać — to sygnał, żeby ją wygenerować ponownie.
- Wyrównanie po stopach zakłada, że najniższy piksel to stopa; opadający ogon albo
  ogień pod linią stóp przesunie klatkę w górę (sprawdź na podglądzie).
