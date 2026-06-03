# Исследование: компактные Bluetooth термопринтеры этикеток

> Дата: 2026-03-15
> Цель: найти популярные модели на российских маркетплейсах, разбить по брендам, определить протоколы для Web Bluetooth интеграции

---

## 1. Популярные модели по брендам

### NIIMBOT

| Модель  | Цена (₽)     | Ширина этикетки | Bluetooth | Разрешение | Где продаётся |
| ------- | ------------ | --------------- | --------- | ---------- | ------------- |
| D11     | ~1 100       | 12–15 мм        | BLE 4.0   | 203 dpi    | Ozon, WB, YM  |
| D110    | ~1 200       | 12–15 мм        | BLE 4.0   | 203 dpi    | Ozon, WB, YM  |
| D101    | ~1 100       | 12–25 мм        | BLE 4.0   | 203 dpi    | Ozon, WB, YM  |
| B21     | ~2 500–3 500 | 20–50 мм        | BLE 4.0   | 203 dpi    | Ozon, WB, YM  |
| B21S    | ~3 000–4 000 | 20–50 мм        | BLE 4.0   | 203 dpi    | Ozon, WB      |
| B1      | ~3 500–5 000 | 20–75 мм        | BLE 4.0   | 203 dpi    | Ozon, WB, YM  |
| B18     | ~4 000–5 500 | 20–75 мм        | BLE 4.0   | 203 dpi    | Ozon, WB      |
| B21 Pro | ~4 500–6 000 | 20–50 мм        | BLE       | 300 dpi    | Ozon, WB      |

**Протокол:** Проприетарный Niimbot BLE GATT. Полностью реверс-инженирован.

**Лидер рынка** — самый популярный бренд компактных принтеров на всех трёх площадках. B21 — бестселлер для бизнеса, D11/D110 — для домашнего использования.

---

### Phomemo

| Модель  | Цена (₽)     | Ширина этикетки | Bluetooth | Разрешение | Где продаётся |
| ------- | ------------ | --------------- | --------- | ---------- | ------------- |
| D30     | ~1 500–2 000 | 12–15 мм        | BLE       | 203 dpi    | Ozon, WB      |
| M02     | ~2 000–3 000 | 53 мм (чеки)    | BLE       | 203 dpi    | Ozon, WB      |
| M02S    | ~2 500–3 500 | 53 мм           | BLE       | 304 dpi    | Ozon, WB      |
| M02 Pro | ~3 000–4 000 | 53 мм           | BLE       | 304 dpi    | Ozon, WB      |
| M110    | ~3 000–4 500 | 20–50 мм        | BLE       | 203 dpi    | Ozon, WB, YM  |
| M120    | ~3 500–5 000 | 20–75 мм        | BLE       | 203 dpi    | Ozon, WB      |
| M220    | ~5 000–7 000 | 20–75 мм        | BLE       | 203 dpi    | Ozon, WB      |
| T02     | ~2 000–2 500 | 53 мм           | BLE       | 203 dpi    | Ozon, WB      |

**Протокол:** ESC/POS (модифицированный EPSON). Реверс-инженирован через Bluetooth sniffing.

**Второй по популярности** бренд. M110 — основной конкурент Niimbot B21 для этикеток. M02 линейка — больше для чеков/фото.

---

### Peripage

| Модель | Цена (₽)     | Ширина печати | Bluetooth        | Разрешение | Где продаётся |
| ------ | ------------ | ------------- | ---------------- | ---------- | ------------- |
| A6     | ~1 500–2 500 | 58 мм         | BT Classic (SPP) | 203 dpi    | Ozon, WB      |
| A6+    | ~2 000–3 000 | 58 мм         | BT Classic (SPP) | 304 dpi    | Ozon, WB      |
| A9     | ~2 500–3 500 | 58 мм         | BLE              | 304 dpi    | Ozon, WB      |
| A9S    | ~3 000–4 000 | 58 мм         | BLE              | 304 dpi    | Ozon, WB, YM  |

**Протокол:** Проприетарный (НЕ ESC/POS). Старые модели (A6/A6+) используют Bluetooth Classic (RFCOMM/SPP), что **несовместимо с Web Bluetooth**. Новые A9/A9S — BLE.

**Важно:** A6/A6+ не подойдут для Web Bluetooth — используют Classic Bluetooth. Только A9/A9S с BLE.

---

### HPRT (汉印)

| Модель  | Цена (₽)     | Ширина этикетки | Bluetooth | Разрешение | Где продаётся |
| ------- | ------------ | --------------- | --------- | ---------- | ------------- |
| T260LR  | ~3 000–4 500 | 20–50 мм        | BLE       | 203 dpi    | Ozon, WB, YM  |
| HM-T260 | ~4 000–6 000 | 20–50 мм        | BLE       | 203 dpi    | YM            |
| HM-T360 | ~5 000–7 000 | 20–75 мм        | BLE       | 203 dpi    | YM            |

**Протокол:** ESC/POS + TSPL. Профессиональный бренд с SDK и документацией.

Рейтинг 4.7 на Яндекс Маркете (53+ оценки, 165+ покупок для T260LR). Менее популярен в потребительском сегменте, но хорошо документирован.

---

### CHITENG / CLABEL

| Модель | Цена (₽)     | Ширина этикетки | Bluetooth | Разрешение | Где продаётся |
| ------ | ------------ | --------------- | --------- | ---------- | ------------- |
| CT221B | ~2 500–4 000 | 20–50 мм        | BLE       | 203 dpi    | Ozon, WB, YM  |

**Протокол:** Неизвестен, проприетарное приложение OpenLabel+. Нет open-source реверса. Скорее всего проприетарный.

Рейтинг 4.7 на Яндекс Маркете. Бюджетная альтернатива Niimbot B21.

---

### Xprinter

| Модель     | Цена (₽)     | Ширина этикетки | Bluetooth | Разрешение | Где продаётся |
| ---------- | ------------ | --------------- | --------- | ---------- | ------------- |
| XP-365B    | ~3 000–5 000 | до 80 мм        | BT + USB  | 203 dpi    | Ozon, WB, YM  |
| MP2 Pocket | ~4 000–6 000 | до 58 мм        | BLE       | 203 dpi    | YM            |

**Протокол:** TSPL + ESC/POS. Стандартные протоколы.

XP-365B — бестселлер (1300+ отзывов на YM, рейтинг 4.8), но это настольный принтер, не карманный. MP2 — портативный.

---

## 2. Протоколы печати и совместимость с Web Bluetooth

### Протокол Niimbot (проприетарный)

- **Тип:** Проприетарный бинарный протокол поверх BLE GATT
- **Принтеры:** Все Niimbot (D11, D110, D101, B1, B18, B21, B21S, B21 Pro)
- **BLE:** Да, GATT services/characteristics
- **Web Bluetooth:** ✅ Полная поддержка через [NiimBlueLib](https://github.com/MultiMote/niimbluelib)
- **Open-source:**
  - [NiimBlue](https://github.com/MultiMote/niimblue) — полноценный веб-клиент (TypeScript, Web Bluetooth)
  - [NiimBlueLib](https://github.com/MultiMote/niimbluelib) — библиотека (TypeScript)
  - [niimprint](https://github.com/AndBondStyle/niimprint) — Python (BLE + USB)
  - [NiimPrintX](https://github.com/labbots/NiimPrintX) — Python
- **Особенность:** Старые принтеры имеют рандомные service UUID, что усложняет обнаружение через Web Bluetooth

### ESC/POS (Epson Standard)

- **Тип:** Стандартный текстовый/бинарный протокол
- **Принтеры:** Phomemo (все модели), HPRT, Xprinter, множество китайских noname
- **BLE:** Да (зависит от модели)
- **Web Bluetooth:** ✅ Поддерживается через [WebBluetoothReceiptPrinter](https://github.com/NielsLeenheer/WebBluetoothReceiptPrinter)
- **Open-source:**
  - [phomemo-tools](https://github.com/vivier/phomemo-tools) — Linux CUPS driver (Python)
  - [phomemo_m02s](https://github.com/theacodes/phomemo_m02s) — Python BLE
  - [escpos-xml](https://github.com/ingoncalves/escpos-xml) — JavaScript
  - [WebBluetoothReceiptPrinter](https://github.com/NielsLeenheer/WebBluetoothReceiptPrinter) — Web Bluetooth
- **Особенность:** Phomemo использует модифицированный ESC/POS. Команды инициализации отличаются от стандарта.

### TSPL (TSC Printer Language)

- **Тип:** Текстовый командный язык
- **Принтеры:** HPRT, Xprinter, TSC, многие промышленные
- **BLE:** Зависит от модели
- **Web Bluetooth:** ⚠️ Нет готовой JS-библиотеки, но протокол текстовый — легко реализовать
- **Open-source:** [react-native-bluetooth-escpos-printer](https://github.com/januslo/react-native-bluetooth-escpos-printer) — поддерживает TSC

### Peripage (проприетарный)

- **Тип:** Проприетарный, НЕ ESC/POS
- **Принтеры:** Peripage A6, A6+, A9, A9S
- **BLE:** Только A9/A9S. A6/A6+ — Bluetooth Classic (RFCOMM)
- **Web Bluetooth:** ⚠️ Только A9/A9S теоретически, нет JS-реализации
- **Open-source:**
  - [peripage-A6-bluetooth](https://github.com/eliasweingaertner/peripage-A6-bluetooth) — Python, BT Classic
  - [peripage-python](https://github.com/bitrate16/peripage-python) — Python
- **Особенность:** A6/A6+ несовместимы с Web Bluetooth (BT Classic). Протокол полностью проприетарный.

### CHITENG/CLABEL (неизвестный)

- **Тип:** Проприетарный (предположительно)
- **Принтеры:** CT221B
- **BLE:** Да
- **Web Bluetooth:** ❌ Нет реверс-инженеринга, нет open-source
- **Open-source:** Нет

---

## 3. Матрица совместимости с Web Bluetooth

| Бренд               | Протокол            | BLE                  | Web BT готовность    | JS-библиотека          | Приоритет                  |
| ------------------- | ------------------- | -------------------- | -------------------- | ---------------------- | -------------------------- |
| **Niimbot**         | Niimbot proprietary | ✅                   | ✅ Готово            | NiimBlueLib (TS)       | 🟢 Уже работает            |
| **Phomemo**         | ESC/POS (модифиц.)  | ✅                   | ⚠️ Нужна адаптация   | phomemo-tools (Python) | 🟡 Реально за 3-5 дней     |
| **HPRT**            | ESC/POS + TSPL      | ✅                   | ⚠️ Нужна адаптация   | Нет готовой            | 🟡 Реально, есть SDK       |
| **Xprinter**        | TSPL + ESC/POS      | ⚠️ Зависит от модели | ⚠️ Нужна реализация  | Нет готовой            | 🟡 Для портативных моделей |
| **Peripage A9/A9S** | Proprietary         | ✅                   | ⚠️ Нет JS-реализации | Только Python          | 🟠 Нужен порт Python→JS    |
| **Peripage A6/A6+** | Proprietary         | ❌ BT Classic        | ❌ Невозможно        | —                      | 🔴 Несовместим             |
| **CHITENG/CLABEL**  | Unknown             | ✅                   | ❌ Нет реверса       | —                      | 🔴 Нужен полный реверс     |

---

## 4. Рекомендации для нашего проекта

### Что уже можно поддержать (минимальные усилия):

1. **Niimbot (все модели)** — через [NiimBlueLib](https://github.com/MultiMote/niimbluelib), готовая TypeScript библиотека для Web Bluetooth. Это уже наш основной принтер.

### Что можно добавить следующим (средние усилия, 3-5 дней):

2. **Phomemo M110/M120/M220** — ESC/POS over BLE. Нужно:
   - Портировать логику из [phomemo-tools](https://github.com/vivier/phomemo-tools)
   - Использовать [WebBluetoothReceiptPrinter](https://github.com/NielsLeenheer/WebBluetoothReceiptPrinter) как основу
   - Адаптировать команды инициализации Phomemo

3. **HPRT T260LR** — ESC/POS + TSPL, есть официальный SDK. Потенциально проще всего из «не-Niimbot».

### Что требует больше работы (7+ дней):

4. **Peripage A9/A9S** — нужен порт протокола из Python в JS + тестирование
5. **Xprinter MP2** — TSPL over BLE, нужна реализация TSPL-генератора

### Не стоит поддерживать:

- **Peripage A6/A6+** — Bluetooth Classic, несовместимо с Web Bluetooth
- **CHITENG/CLABEL** — нет документации протокола, нет community

---

## 5. Ключевые open-source проекты

| Проект                     | Язык             | Принтеры                       | Ссылка                                                                                                             |
| -------------------------- | ---------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| NiimBlue                   | TypeScript (Web) | Niimbot все                    | [github.com/MultiMote/niimblue](https://github.com/MultiMote/niimblue)                                             |
| NiimBlueLib                | TypeScript       | Niimbot все                    | [github.com/MultiMote/niimbluelib](https://github.com/MultiMote/niimbluelib)                                       |
| niimprint                  | Python           | Niimbot D11/B21/B1/D110/B18    | [github.com/AndBondStyle/niimprint](https://github.com/AndBondStyle/niimprint)                                     |
| phomemo-tools              | Python/C         | Phomemo M02/M110/M120/M220/T02 | [github.com/vivier/phomemo-tools](https://github.com/vivier/phomemo-tools)                                         |
| WebBluetoothReceiptPrinter | JS               | ESC/POS BLE принтеры           | [github.com/NielsLeenheer/WebBluetoothReceiptPrinter](https://github.com/NielsLeenheer/WebBluetoothReceiptPrinter) |
| peripage-python            | Python           | Peripage A6/A6+                | [github.com/bitrate16/peripage-python](https://github.com/bitrate16/peripage-python)                               |
| escpos-xml                 | JS               | ESC/POS любые                  | [github.com/ingoncalves/escpos-xml](https://github.com/ingoncalves/escpos-xml)                                     |
