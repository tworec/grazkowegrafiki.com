# Updateon — zbieranie surowców i ulepszenia Dina

Stan na 2026-09-20: projekt mechaniki, grafiki trzech surowców i gotowy sprite
Updateona są gotowe. Mechanika nie jest jeszcze podpięta do gry. Szkic urządzenia:
`dino-vs-kosmici/assets-src/artifacts/updateon-antos-sketch.jpg`.

## Surowce

- krzaki po zniszczeniu wyrzucają 1–3 **patyczki** (`sticks`),
- skały po zniszczeniu wyrzucają 2–4 **kamyczki** (`pebbles`),
- drzewa po ścięciu wyrzucają 1–2 **kłody** (`logs`).

Surowce wypadają jako małe obiekty na mapie i są zbierane po podejściu Dina.
Licznik każdego rodzaju ma być widoczny przy interfejsie Updateona.

## Zakupy w Updateonie

Updateon oferuje trzy niezależne ścieżki. Poziom i cena rosną osobno dla
każdej ścieżki. Każdy zakup kosztuje wszystkie trzy surowce.

| Poziom | Kłody | Kamyczki | Patyczki | Więcej HP | Więcej obrażeń | Mniej otrzymywanych obrażeń | XP za zakup |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 3 | 2 | +10 | +2 | 8% | 20 |
| 2 | 2 | 6 | 4 | +15 | +3 | 10% | 35 |
| 3 | 4 | 10 | 7 | +20 | +4 | 12% | 55 |
| 4 | 6 | 15 | 10 | +25 | +5 | 15% | 80 |

- Zakup HP zwiększa `maxHp` o wartość z tabeli i od razu leczy o tyle samo.
- Zakup obrażeń wzmacnia wszystkie bezpośrednie ataki Dina: pazur, ogon i
  zionięcie ogniem.
- Zakup obrony dodaje redukcję z tabeli. Po czterech zakupach daje łącznie
  45% redukcji obrażeń.
- **Każdy** zakup wywołuje istniejące `addXP()` z wartością z tabeli, więc może
  uruchomić zwykły awans poziomu i wybór karty ulepszenia.

## Gotowe grafiki

Pełne źródła z generatora są w `dino-vs-kosmici/assets-src/props/`, a lekkie
wersje do gry w `dino-vs-kosmici/assets/props/`:

- `pebbles.png` — kamyczki,
- `sticks.png` — patyczki,
- `logs.png` — duże kłody,
- `updateon.png` — stacja ulepszeń z trzema wejściami na surowce.
