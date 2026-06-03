"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui";
import { cn } from "@/utils/cn";

/* ─── Building blocks ─────────────────────────────────────────────── */

function Step({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-accent-blue/20 text-accent-blue text-xs font-bold flex items-center justify-center mt-0.5">
        {num}
      </div>
      <p className="text-sm text-white/60 leading-relaxed">{children}</p>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 mt-3 px-3 py-2 rounded-xl bg-accent-blue/8 border border-accent-blue/20">
      <svg
        className="w-4 h-4 text-accent-blue flex-shrink-0 mt-0.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <p className="text-xs text-white/60 leading-relaxed">{children}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-white mb-3">{children}</h3>;
}

function Divider() {
  return <div className="border-t border-white/[0.06]" />;
}

/* ─── Accordion section ───────────────────────────────────────────── */

function GuideAccordion({
  title,
  icon,
  color = "blue",
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  color?: "blue" | "green" | "orange" | "red" | "purple";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const colorStyles = {
    blue: "bg-accent-blue/20 text-accent-blue border-accent-blue/20",
    green: "bg-accent-green/20 text-accent-green border-accent-green/20",
    orange: "bg-accent-orange/20 text-accent-orange border-accent-orange/20",
    red: "bg-accent-red/20 text-accent-red border-accent-red/20",
    purple: "bg-accent-purple/20 text-accent-purple border-accent-purple/20",
  };

  return (
    <div className="rounded-2xl overflow-hidden bg-gradient-to-b from-white/[0.06] to-white/[0.03] border border-glass">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 p-4 text-left active:bg-white/[0.04] transition-colors"
      >
        <div
          className={cn(
            "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border",
            colorStyles[color]
          )}
        >
          {icon}
        </div>
        <span className="text-sm font-medium text-white flex-1">{title}</span>
        <motion.svg
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-4 h-4 text-white/40 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-white/[0.06]">
              <div className="pt-4">{children}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Icons ───────────────────────────────────────────────────────── */

const icons = {
  rocket: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    </svg>
  ),
  box: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
      />
    </svg>
  ),
  printer: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
      />
    </svg>
  ),
  truck: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7h12l2 5h1v4h-2m-1 0a2 2 0 11-4 0m4 0a2 2 0 10-4 0M7 17a2 2 0 11-4 0m4 0a2 2 0 10-4 0m0 0H3V9h4l3-4h4"
      />
    </svg>
  ),
  returnIcon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
      />
    </svg>
  ),
  warning: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
      />
    </svg>
  ),
  warehouse: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  ),
  money: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  key: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
      />
    </svg>
  ),
  question: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

/* ─── Main component ──────────────────────────────────────────────── */

export function GuideSection() {
  return (
    <div className="space-y-3">
      {/* ─── Быстрый старт ─────────────────────────────────────── */}
      <GuideAccordion title="Быстрый старт" icon={icons.rocket} color="blue" defaultOpen>
        <div className="space-y-4">
          <div>
            <SectionTitle>Что это за система</SectionTitle>
            <p className="text-sm text-white/60 leading-relaxed">
              Ты — отправщик. Твоя задача: брать заказы в работу, собирать товар на складе, сдавать
              посылки в ПВЗ службы доставки и принимать возвраты. Печать стикера — по желанию, не
              обязательна. Всё управляется через 4 вкладки внизу экрана.
            </p>
          </div>

          <Divider />

          <div>
            <SectionTitle>Браузер</SectionTitle>
            <div className="space-y-2 text-sm text-white/60 leading-relaxed">
              <p>
                <strong className="text-white">iPhone:</strong> работай через{" "}
                <strong className="text-white">Bluefy</strong> (скачай в App Store). Это
                единственный браузер на iOS с поддержкой Bluetooth-принтера. Safari и Chrome{" "}
                <strong className="text-white">не подходят</strong> — кнопка «Подключить принтер» в
                них не сработает.
              </p>
              <p>
                <strong className="text-white">Android:</strong> подойдёт обычный{" "}
                <strong className="text-white">Google Chrome</strong>. Bluetooth-принтер подключится
                без проблем — Android поддерживает Web Bluetooth из коробки.
              </p>
            </div>
            <Tip>
              Печать стикера — необязательна: можно работать вообще без принтера, просто жми «Сдал в
              ПВЗ». Браузер с Bluetooth нужен только если ты всё-таки печатаешь стикеры.
            </Tip>
          </div>

          <Divider />

          <div>
            <SectionTitle>4 вкладки внизу экрана</SectionTitle>
            <div className="space-y-2 text-sm text-white/60 leading-relaxed">
              <p>
                <strong className="text-white">Заказы</strong> — основная работа. 4 вкладки:
                Собрать, Отправить, Возвраты, История.
              </p>
              <p>
                <strong className="text-white">Склад</strong> — товары и остатки по размерам.
              </p>
              <p>
                <strong className="text-white">Деньги</strong> — заработок, графики, история выплат.
              </p>
              <p>
                <strong className="text-white">Я</strong> — настройки принтера, эта инструкция,
                выход.
              </p>
            </div>
          </div>
        </div>
      </GuideAccordion>

      {/* ─── Заказы: Собрать ───────────────────────────────────── */}
      <GuideAccordion title="Собрать — взять заказы в работу" icon={icons.box} color="blue">
        <div className="space-y-4">
          <p className="text-sm text-white/60 leading-relaxed">
            Первый этап — общий пул. Сюда попадают все новые оплаченные заказы. Твоя задача — взять
            заказ в работу, чтобы закрепить его за собой и начать сборку.
          </p>

          <Divider />

          <SectionTitle>Как взять заказ в работу</SectionTitle>
          <div className="space-y-2">
            <Step num={1}>
              Отметь нужные заказы галочкой (можно несколько сразу, или{" "}
              <strong className="text-white">Выбрать все</strong>).
            </Step>
            <Step num={2}>
              Внизу появится кнопка <strong className="text-white">Беру в работу (N)</strong> —
              нажми её.
            </Step>
            <Step num={3}>
              Заказы закрепятся за тобой и переедут во вкладку{" "}
              <strong className="text-white">Отправить</strong>. Печатать стикер здесь не нужно —
              печать необязательна и доступна позже по желанию.
            </Step>
          </div>

          <Divider />

          <SectionTitle>Если у заказа нет размера</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            Бывает у заказов из Авито-магазинов. Рядом с названием товара появятся кнопки размеров
            (S, M, L...). Нажми нужный размер — он установится. Если нужно задать размер нескольким
            заказам одного товара — выбери их и нажми{" "}
            <strong className="text-white">Установить размер</strong> внизу.
          </p>

          <Divider />

          <SectionTitle>Группировка</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            Заказы сгруппированы: сначала срочные (дедлайн сегодня-завтра), потом обычные.
            Проблемные заказы с пометкой «трек не сканируется» остаются здесь и ждут нового трека от
            клиента.
          </p>

          <Tip>
            На карточке заказа видно фото товара, номер заказа, имя получателя и дедлайн отправки.
            Бейдж «Срочно» = дедлайн сегодня или завтра.
          </Tip>
        </div>
      </GuideAccordion>

      {/* ─── Заказы: Отправить ─────────────────────────────────── */}
      <GuideAccordion title="Отправить — сдать в ПВЗ" icon={icons.truck} color="blue">
        <div className="space-y-4">
          <p className="text-sm text-white/60 leading-relaxed">
            Заказы, которые ты взял в работу. Сгруппированы по службам доставки. Собери товар, при
            желании напечатай стикер и сдай посылки в пункт выдачи службы.
          </p>

          <Divider />

          <SectionTitle>Как сдать заказы</SectionTitle>
          <div className="space-y-2">
            <Step num={1}>Выбери заказы — можно целую группу по службе доставки сразу.</Step>
            <Step num={2}>
              Нажми кнопку <strong className="text-white">🚚 Сдал в ПВЗ (N)</strong> внизу.
            </Step>
            <Step num={3}>
              Откроется окно выбора ПВЗ (пункта выдачи). Выбери адрес, куда сдаёшь посылки для
              каждой службы доставки, и подтверди.
            </Step>
            <Step num={4}>
              Заказы уйдут в <strong className="text-white">Историю</strong> со статусом
              «Отправлен». Клиент получит уведомление.
            </Step>
          </div>

          <Divider />

          <SectionTitle>Печать стикеров — по желанию</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            Кнопка <strong className="text-white">🖨 Напечатать стикеры (N)</strong> открывает окно
            печати на Bluetooth-принтере. Это <strong className="text-white">необязательный</strong>{" "}
            шаг — он не блокирует «Сдал в ПВЗ». Можно сдавать заказы вообще без печати.
          </p>

          <Divider />

          <SectionTitle>Пункты выдачи (ПВЗ)</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">В окне выбора ПВЗ можно:</p>
          <div className="space-y-1.5 mt-2 text-sm text-white/60 leading-relaxed">
            <p>— выбрать сохранённый адрес</p>
            <p>
              — <strong className="text-white">добавить новый</strong> (введи адрес и сохрани)
            </p>
            <p>
              — <strong className="text-white">удалить</strong> ненужный адрес
            </p>
            <p>
              — или сдать <strong className="text-white">без ПВЗ</strong>, если адрес не нужен
            </p>
          </div>

          <Divider />

          <SectionTitle>Проблема с заказом</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            Кнопка с восклицательным знаком <strong className="text-white">⚠️</strong> — отметить
            проблему: «нет на складе» или «трек не сканируется на ПВЗ» (подробнее — раздел
            «Проблемные заказы»).
          </p>

          <Tip>
            После «Сдал в ПВЗ» заказ закрыт и уходит в Историю — это финальный шаг. Если сдал не тот
            заказ, исправить может только владелец из панели — напиши ему.
          </Tip>
        </div>
      </GuideAccordion>

      {/* ─── Заказы: Возвраты ──────────────────────────────────── */}
      <GuideAccordion title="Возвраты — приём обратно" icon={icons.returnIcon} color="orange">
        <div className="space-y-4">
          <p className="text-sm text-white/60 leading-relaxed">
            Сюда попадают заказы, которые возвращаются на склад (покупатель не забрал, отказ, брак).
          </p>

          <Divider />

          <SectionTitle>📢 Протрубить возвраты</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            Большая кнопка вверху. Нажми перед выездом за возвратами — клиентам, у которых есть
            возврат, уйдёт напоминание прислать актуальный код возврата. Жмётся{" "}
            <strong className="text-white">один раз в день</strong> на весь магазин. Если выехал зря
            — рядом кнопка <strong className="text-white">Отменить</strong> (клиентам уйдёт «ложная
            тревога»).
          </p>

          <Divider />

          <SectionTitle>На ПВЗ — результат по каждому возврату</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            На карточке возврата виден код возврата (для Авито — ссылка «Посмотреть код на Авито»).
            После проверки нажми одну из 4 кнопок:
          </p>
          <div className="space-y-1.5 mt-2 text-sm text-white/60 leading-relaxed">
            <p>
              <strong className="text-white">✅ Забран</strong> — посылка у тебя, всё в порядке.
              Товар вернётся на склад, клиенту вернутся деньги на баланс.
            </p>
            <p>
              <strong className="text-white">❌ Неверный код</strong> — код не подошёл. Клиенту
              уйдёт сообщение «обнови код». Возврат останется в списке.
            </p>
            <p>
              <strong className="text-white">❌ Неверный трек</strong> — трек не сканируется.
              Клиенту уйдёт сообщение «обнови трек». Возврат останется в списке.
            </p>
            <p>
              <strong className="text-white">❌ Нет на ПВЗ</strong> — посылка ещё не доехала. Это
              норма: попытка засчитывается, придёшь в другой день.
            </p>
          </div>

          <Divider />

          <SectionTitle>⚠️ Плохое качество</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            Если товар вернулся повреждённым или в браке — нажми{" "}
            <strong className="text-white">⚠️ Плохое качество</strong> на карточке. Откроется окно:
          </p>
          <div className="space-y-2 mt-2">
            <Step num={1}>
              Сфотографируй брак — <strong className="text-white">минимум 3</strong> фото (до 5,
              макс. 5 МБ каждое).
            </Step>
            <Step num={2}>Опиши проблему текстом (минимум 5 символов).</Step>
            <Step num={3}>
              Подтверди — возврат закроется. Товар на склад{" "}
              <strong className="text-white">не вернётся</strong> (брак), деньги клиенту{" "}
              <strong className="text-white">не возвращаются</strong>. Фото уйдут клиенту для
              разбора с Авито-поддержкой.
            </Step>
          </div>

          <Tip>
            За принятые возвраты оплата тебе <strong className="text-white">не начисляется</strong>{" "}
            — только за отправленные заказы. Но факт работы на ПВЗ учитывается в статистике.
          </Tip>
        </div>
      </GuideAccordion>

      {/* ─── Заказы: История ───────────────────────────────────── */}
      <GuideAccordion title="История — архив заказов" icon={icons.question} color="purple">
        <div className="space-y-4">
          <p className="text-sm text-white/60 leading-relaxed">
            Последняя вкладка в заказах — все завершённые, отменённые и утилизированные заказы.
          </p>

          <Divider />

          <SectionTitle>Поиск</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            Вверху есть строка поиска — ищи по <strong className="text-white">номеру заказа</strong>{" "}
            или <strong className="text-white">трек-номеру</strong>. Результаты обновляются
            автоматически при вводе.
          </p>

          <Divider />

          <SectionTitle>Постраничная навигация</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            Показывается по 50 заказов на странице. Внизу кнопки{" "}
            <strong className="text-white">Назад</strong> и{" "}
            <strong className="text-white">Вперёд</strong> для навигации.
          </p>
        </div>
      </GuideAccordion>

      {/* ─── Проблемы ──────────────────────────────────────────── */}
      <GuideAccordion title="Проблемные заказы" icon={icons.warning} color="red">
        <div className="space-y-4">
          <p className="text-sm text-white/60 leading-relaxed">
            Если при сборке что-то пошло не так — заказ можно пометить как проблемный. Проблемные
            заказы выделяются красным с полосатым фоном.
          </p>

          <Divider />

          <SectionTitle>Как отметить проблему</SectionTitle>
          <div className="space-y-2">
            <Step num={1}>
              Выбери заказ (или несколько) во вкладке{" "}
              <strong className="text-white">Собрать</strong> или{" "}
              <strong className="text-white">Отправить</strong>.
            </Step>
            <Step num={2}>
              Нажми кнопку <strong className="text-white">⚠️</strong> (рядом с «Беру в работу» или
              «Сдал в ПВЗ»).
            </Step>
            <Step num={3}>Выбери причину:</Step>
          </div>
          <div className="space-y-1.5 mt-2 pl-9 text-sm text-white/60 leading-relaxed">
            <p>
              <strong className="text-white">Нет на складе</strong> — товара физически нет. Заказ
              временно скроется из «Собрать» и разрулится сам: подтянется с ближайшего возврата или
              сгорит по дедлайну. Тебе делать ничего не нужно.
            </p>
            <p>
              <strong className="text-white">Трек не сканируется на ПВЗ</strong> — клиент прислал
              некорректный трек, нужно ждать новый. Заказ остаётся в «Собрать». Когда клиент пришлёт
              исправленный — жми <strong className="text-white">Вернуть в работу</strong>.
            </p>
          </div>

          <Divider />

          <SectionTitle>Вернуть в работу</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            Выбери проблемный заказ и нажми <strong className="text-white">Вернуть в работу</strong>{" "}
            — заказ снова появится в обычной очереди на сборку.
          </p>
        </div>
      </GuideAccordion>

      {/* ─── Склад ─────────────────────────────────────────────── */}
      <GuideAccordion title="Склад — товары и остатки" icon={icons.warehouse} color="orange">
        <div className="space-y-4">
          <p className="text-sm text-white/60 leading-relaxed">
            Вкладка <strong className="text-white">Склад</strong> — все товары с остатками по
            размерам.
          </p>

          <Divider />

          <SectionTitle>Фильтры</SectionTitle>
          <div className="space-y-1.5 text-sm text-white/60 leading-relaxed">
            <p>
              <strong className="text-white">Все</strong> — все товары.
            </p>
            <p>
              <strong className="text-white">В наличии</strong> — только те, где есть остатки.
            </p>
            <p>
              <strong className="text-white">Нет в наличии</strong> — закончившиеся товары.
            </p>
            <p>Строка поиска — ищи по названию.</p>
          </div>

          <Divider />

          <SectionTitle>Карточка товара</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            На каждой карточке видно: фото, название, общее количество и раскладку по размерам. Если
            товар зарезервирован для заказов — это тоже отображается.
          </p>

          <Divider />

          <SectionTitle>Корректировка остатков</SectionTitle>
          <div className="space-y-2">
            <Step num={1}>Нажми на карточку товара — откроется модальное окно.</Step>
            <Step num={2}>Измени количество по каждому размеру (кнопки +/−).</Step>
            <Step num={3}>
              Можно <strong className="text-white">добавить новый размер</strong>.
            </Step>
            <Step num={4}>
              Можно указать <strong className="text-white">фактическое количество</strong> — для
              инвентаризации (сверки физического наличия с системой).
            </Step>
            <Step num={5}>Можно заменить фото товара.</Step>
          </div>

          <Divider />

          <SectionTitle>Создание товара</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            Кнопка <strong className="text-white">+ Добавить товар</strong> — укажи название,
            размеры с количеством и (по желанию) фото.
          </p>

          <Divider />

          <SectionTitle>Удаление товара</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            В модальном окне корректировки есть кнопка удаления (с подтверждением).
          </p>
        </div>
      </GuideAccordion>

      {/* ─── Деньги ────────────────────────────────────────────── */}
      <GuideAccordion title="Деньги — заработок и выплаты" icon={icons.money} color="green">
        <div className="space-y-4">
          <p className="text-sm text-white/60 leading-relaxed">
            Вкладка <strong className="text-white">Деньги</strong> — полная картина твоего
            заработка.
          </p>

          <Divider />

          <SectionTitle>К выплате</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            Большая зелёная сумма вверху — сколько тебе начислено и ещё не выплачено. Владелец
            переводит накопленное вручную и фиксирует выплату — после этого она появляется в
            истории, а счётчик «к выплате» уменьшается. Жёсткого расписания нет.
          </p>

          <Divider />

          <SectionTitle>Режим оплаты</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            В правом верхнем углу видно тип оплаты:
          </p>
          <div className="space-y-1.5 mt-2 text-sm text-white/60 leading-relaxed">
            <p>
              <strong className="text-white">Маятник</strong> — ставка за заказ плавает от твоего
              рейтинга: чем стабильнее отправляешь доступные заказы, тем выше рейтинг и ставка.
            </p>
            <p>
              <strong className="text-white">Фиксированная</strong> — одна ставка за каждый
              отгруженный заказ. Рейтинг на оплату не влияет.
            </p>
          </div>

          <Tip>
            Режим оплаты устанавливает владелец. Ты видишь свой текущий режим, но не можешь его
            менять.
          </Tip>

          <Divider />

          <SectionTitle>Маятник — подробнее</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            Если у тебя режим «Маятник», под суммой к выплате отображается шкала рейтинга:
          </p>
          <div className="space-y-1.5 mt-2 text-sm text-white/60 leading-relaxed">
            <p>
              — <strong className="text-white">Рейтинг</strong> — число 0–100. Ставка за заказ = мин
              + рейтинг/100 × (макс − мин). Диапазон мин/макс задаёт владелец.
            </p>
            <p>
              — <strong className="text-white">Объём</strong> — доля отгруженных тобой заказов от
              доступных за день. Рейтинг ежедневно подтягивается к этой доле.
            </p>
            <p className="text-accent-orange/80">
              Важно: рейтинг падает быстрее, чем растёт. Стабильная работа — ключ к высокой ставке.
            </p>
          </div>

          <Divider />

          <SectionTitle>Статистика за месяц</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            Отправлено заказов, возвратов, заработано. Внизу —{" "}
            <strong className="text-white">график заработка по дням</strong> за текущий месяц.
          </p>

          <Divider />

          <SectionTitle>За всё время</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            Общее количество отправок и общий заработок с момента начала работы.
          </p>

          <Divider />

          <SectionTitle>История выплат</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            Список всех прошлых выплат с датой и суммой. Появится после первой выплаты.
          </p>
        </div>
      </GuideAccordion>

      {/* ─── Принтер ───────────────────────────────────────────── */}
      <GuideAccordion title="Настройка принтера" icon={icons.printer} color="purple">
        <div className="space-y-4">
          <SectionTitle>Первое подключение</SectionTitle>
          <div className="space-y-2">
            <Step num={1}>Включи принтер и Bluetooth на телефоне.</Step>
            <Step num={2}>
              Прокрути выше на этой же странице → раздел{" "}
              <strong className="text-white">Принтер</strong> →{" "}
              <strong className="text-white">Подключить</strong>.
            </Step>
            <Step num={3}>Выбери свой принтер из списка Bluetooth-устройств.</Step>
            <Step num={4}>
              Нажми <strong className="text-white">Тест</strong> — должна напечататься пробная
              этикетка.
            </Step>
          </div>

          <Divider />

          <SectionTitle>Типы принтеров</SectionTitle>
          <div className="space-y-1.5 text-sm text-white/60 leading-relaxed">
            <p>
              <strong className="text-white">ESC/POS</strong> — стандартный термопринтер (TSC, HPRT
              и т.д.). Подходит для большинства принтеров.
            </p>
            <p>
              <strong className="text-white">Niimbot</strong> — принтеры этикеток Niimbot. Отдельный
              протокол.
            </p>
          </div>

          <Divider />

          <SectionTitle>Качество печати</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            В дополнительных настройках (раскрываются нажатием) можно переключить DPI:
          </p>
          <div className="space-y-1.5 mt-2 text-sm text-white/60 leading-relaxed">
            <p>
              <strong className="text-white">203 DPI</strong> — стандартное качество, быстрая
              печать.
            </p>
            <p>
              <strong className="text-white">300 DPI</strong> — высокое качество, чётче штрихкоды.
              Если принтер поддерживает.
            </p>
          </div>

          <Tip>
            Если принтер не находится — убедись, что браузер имеет разрешение на Bluetooth. На
            iPhone: Настройки iOS → Bluefy → Bluetooth. На Android: разрешение запросится
            автоматически при первом подключении. Также проверь, что принтер не подключён к другому
            устройству.
          </Tip>
        </div>
      </GuideAccordion>

      {/* ─── Вход ──────────────────────────────────────────────── */}
      <GuideAccordion title="Вход в систему" icon={icons.key} color="blue">
        <div className="space-y-4">
          <SectionTitle>Как войти</SectionTitle>
          <div className="space-y-2">
            <Step num={1}>Получи ключ входа от владельца (через Telegram-бот).</Step>
            <Step num={2}>
              Открой страницу логина в браузере (Bluefy на iPhone, Chrome на Android).
            </Step>
            <Step num={3}>
              Вставь ключ (длинный код) и нажми <strong className="text-white">Войти</strong>.
            </Step>
          </div>

          <Tip>
            Ключ — это одноразовый код. После входа система запомнит тебя. Если вышел из аккаунта —
            потребуется новый ключ.
          </Tip>

          <Divider />

          <SectionTitle>Выход</SectionTitle>
          <p className="text-sm text-white/60 leading-relaxed">
            Кнопка <strong className="text-white">Выйти из аккаунта</strong> — внизу этой страницы
            (красная). После выхода потребуется новый ключ для входа.
          </p>
        </div>
      </GuideAccordion>

      {/* ─── FAQ ───────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <SectionTitle>Частые вопросы</SectionTitle>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-white/80 mb-1">
                Заказ не появляется во вкладке «Отправить»?
              </p>
              <p className="text-sm text-white/60 leading-relaxed">
                Заказ попадает в «Отправить» только после того, как ты взял его в работу в «Собрать»
                (кнопка «Беру в работу»). Печать стикера тут ни при чём — она необязательна. Проверь
                также, что заказ не помечен проблемным «нет на складе» (такие временно скрываются из
                «Собрать»).
              </p>
            </div>

            <Divider />

            <div>
              <p className="text-sm font-medium text-white/80 mb-1">
                Принтер подключился, но этикетка не печатается?
              </p>
              <p className="text-sm text-white/60 leading-relaxed">
                Проверь, что в принтере есть лента. Попробуй нажать «Тест» в настройках принтера.
                Если тест тоже не работает — отключи и подключи принтер заново.
              </p>
            </div>

            <Divider />

            <div>
              <p className="text-sm font-medium text-white/80 mb-1">
                Случайно сдал не тот заказ — что делать?
              </p>
              <p className="text-sm text-white/60 leading-relaxed">
                После «Сдал в ПВЗ» заказ закрыт и уходит в Историю — отменить со своей стороны
                нельзя. Напиши владельцу: он поправит заказ из панели.
              </p>
            </div>

            <Divider />

            <div>
              <p className="text-sm font-medium text-white/80 mb-1">
                Не могу выбрать размер для заказа?
              </p>
              <p className="text-sm text-white/60 leading-relaxed">
                Размер выбирается из тех, что есть на складе. Если нужного размера нет — сначала
                добавь его через вкладку «Склад» → нажми на товар → добавь размер с количеством.
              </p>
            </div>

            <Divider />

            <div>
              <p className="text-sm font-medium text-white/80 mb-1">Данные не обновляются?</p>
              <p className="text-sm text-white/60 leading-relaxed">
                Данные обновляются автоматически в реальном времени. Если кажется, что что-то
                зависло — потяни экран вниз (pull-to-refresh) или перезагрузи страницу.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
